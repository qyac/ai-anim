// @ts-check
/**
 * src/kit/stroke.js - 手绘笔迹：中心线 + 压力 -> 轮廓多边形（BACKLOG 1-69；
 * 素材包能力缺口表第 6 行，覆盖 17 条：K3 K8 K9 K10 K11 L17 L22 M1 M2 X1 X3 X7 X18 X23 X29 Z12 Z14）。
 *
 * 这一层解决的是「一笔一笔真的写出来」，而不是「给折线加个抖动」。
 * 手绘笔迹与引擎里已有的两条路不是一回事：
 *
 *   - lines.polyline / lineart 画的是等宽折线 —— 描边（胶囊），线宽是常量；
 *   - src/kit/boil.js 给折线加 12fps 的抖动 —— 那是「手不稳」，不是「笔有压力」。
 *
 * 真笔迹的全部信息量在宽度沿弧长的分布：
 * 落笔细（只有笔尖接触）-> 中途粗（压下去、行笔快）-> 收笔细（提起来）。
 * 宽度的变化率本身就是笔顺的方向：观众看不见笔，但看得见「这一笔是从哪往哪写的」。
 *
 * ## 三件事（缺一件就变成「一条抖动的粗线」）
 *
 *   1. 压力曲线（pressureEnvelope / pressureProfile）：两端细、中间粗，叠上沿弧长的
 *      低频噪声（手不是机器）；
 *   2. 轮廓多边形（strokeRing）：沿法线双向偏移出上下两条边，两端补圆头 —— 于是
 *      同一条线在粗的地方真的更粗，而不是叠两层；走 lines.fillPoly；
 *   3. 逐笔生长（reveal）：按弧长截断，笔尖永远在已画部分的最前端。
 *
 * ## 五条写错不报错、只出错画面的（这一层最贵的五课）
 *
 * 1. 偏移量必须被斜率夹住（MAX_WIDTH_SLOPE）。宽度沿弧长的变化率一旦 >= 1，
 *    上下两条偏移曲线就会交叉 —— 多边形自交，而 fillPoly 用的是偶奇规则：
 *    自交区被算成「洞」，于是笔画中间出现一个蝴蝶结形的空白。它看起来像
 *    「笔断了」或者「纸上有水渍」，不会报错。所以压力曲线出口处一律按
 *    MAX_WIDTH_SLOPE 逐点夹一次（见 clampWidthSlope）。
 * 2. 笔迹不许用半透明色。同一笔的填充是多条扫描线拼出来的，相邻扫描行之间的
 *    抗锯齿边会叠加（src/core/fill.js 的 SPAN_OVERLAP 就是为这件事留的余量）：
 *    半透明墨色会在笔画里长出横向细纹（放大看像水波）。要淡就用更浅的不透明色。
 * 3. 生长只能按弧长，不能按点数。按点数截断时，密采样段走得慢、疏采样段走得快，
 *    笔尖会一跳一跳；而且同一笔在 4K 与 1080p 上的节奏会不一样。
 * 4. 两端的宽度不能是 0。minW 是物理下限：宽度 < 1px 时 fillPoly 的扫描行
 *    会穿透（多边形比行距还窄），出图是一串虚线点，像传真。默认 minW: 1.2。
 * 5. 端点圆头的半径要用「这一端自己的宽度」，不能拿整笔的平均宽度 —— 否则收笔处
 *    会突然鼓一个包（观众读成「墨滴」）。见 strokeRing 里 cap 的取法。
 *
 * ## 与 boil.js 的关系
 *
 * 笔迹的抖动是可选的（boil: 0 = 一笔画完）。要手绘动画那种「每 2 帧重描一次」，
 * 传 boil：抖动量按 hash2(帧组, 种子) 取（确定性、可 seek、可并行子帧），
 * 每根笔画各自独立（整张纸一起平移就穿帮了）。
 *
 *   import { drawStroke, strokePath } from '../../../src/kit/stroke.js';
 *   lines.begin();
 *   strokePath(lines, [[x0, y], [x0 + w * 0.5, y - 3], [x0 + w, y + 1]], {
 *     width: 7, color: P.signal, reveal: k, boil: { t: f.t, seed: 7, amp: 1.4 },
 *   });
 *   lines.flush(ctx.out);
 *
 * 回归：tools/test-stroke.mjs（纯 JS，不需要 GPU）。
 */

import { clamp, sat, lerp, polylineLengths, pointAtLength, hash2, noise1 } from '../core/util.js';

/** @typedef {[number, number]} XY */
/** @typedef {{ x: number, y: number, w: number, ang: number, u: number }} Sample */

/* ---------------------------------------------------------------- 1. 几何：中心线 */

/**
 * 宽度沿弧长的最大变化率（无量纲）。
 *
 * 为什么是 0.45 而不是 1：1 是几何上的临界值 —— 相邻两条偏移边的位移差
 * 正好等于弧长步进时，两条边互相追上（自交）。留一半余量，是因为采样是折线近似、
 * 且宽度还有噪声项（噪声的局部斜率会比它的幅度更陡）。
 *
 * 改大它就是让「笔画中间长洞」重新出现；tools/test-stroke.mjs 有随机压力下
 * 「多边形不自交」的扫描断言。
 */
export const MAX_WIDTH_SLOPE = 0.45;

/**
 * Catmull-Rom 平滑：把一份手点的折线变成一条过点的曲线。
 *
 * 为什么要它：手写的点列是「关节」（拐角是硬的），而真笔迹在关节处是圆的
 * （手腕转过来了）。直接连折线出图就是「折线」，观众一眼读成「流程图」而不是「字」。
 *
 * @param {XY[]} pts 控制点（至少 2 个）
 * @param {{ steps?: number, closed?: boolean }} [o] steps = 每段插几个点（默认 12）
 * @returns {XY[]}
 */
export function catmullRom(pts, o = {}) {
  const out = [];
  const n = pts.length;
  if (n === 0) return out;
  if (n === 1) return [[pts[0][0], pts[0][1]]];
  const steps = Math.max(2, Math.round(o.steps ?? 12));
  const closed = !!o.closed;
  const P = (i) => {
    if (closed) return pts[((i % n) + n) % n];
    return pts[clamp(i, 0, n - 1)];
  };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t
        + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push([pts[n - 1][0], pts[n - 1][1]]);
  return out;
}

/**
 * 按弧长等距重采样：把折线切成步进 spacing 的点列。
 *
 * 为什么要重采样：压力曲线是弧长的函数（「这一笔写到三分之一处最粗」），
 * 而输入的点疏密不均（手点的时候总是拐角附近密）。不重采样的话，同样的压力曲线
 * 落在密的地方就变成一串粗点、落在疏的地方就变成一根细棍。
 *
 * @param {XY[]} pts
 * @param {number} [spacing] 步进（逻辑像素；默认 8 —— 小于最小线宽的 1/2 就够）
 * @param {{ closed?: boolean }} [o]
 * @returns {{ pts: XY[], arc: number }}
 */
export function resampleByLength(pts, spacing = 8, o = {}) {
  const s = Math.max(0.5, spacing);
  const src = pts.length > 1 ? pts : (pts.length ? [pts[0], pts[0]] : []);
  if (!src.length) return { pts: [], arc: 0 };
  const closed = !!o.closed;
  const loop = closed ? [...src, src[0]] : src;
  const acc = polylineLengths(loop);
  const total = acc[acc.length - 1] || 1;
  const n = Math.max(2, Math.ceil(total / s));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const d = (total * i) / n;
    const [x, y] = pointAtLength(loop, acc, d);
    out.push([x, y]);
  }
  return { pts: out, arc: total };
}

/* ---------------------------------------------------------------- 2. 压力 -> 宽度 */

/**
 * 压力包络：落笔 -> 行笔 -> 收笔。
 *
 * 真实的笔（毛笔、马克笔、铅笔）在纸上留下的宽度是「笔尖与纸的接触面积」，
 * 而接触面积由三件事决定：笔压、速度、笔锋方向。这里做前两件（沿弧长的包络 + 噪声），
 * 第三件（笔锋方向带来的宽窄不对称）交给 lean 参数：
 * 倾斜的笔尖在整个轮廓上偏斜 lean × 半宽，斜着看像 3D 的笔。
 *
 * 两端必须有细的过渡（land / lift）：直接从 1 开始的话，每一笔都是
 * 「方头火柴棍」，一笔一笔写出来像排版而不是手写。
 *
 * @param {number} u 弧长进度 0..1
 * @param {{ land?: number, lift?: number, min?: number }} [o]
 *   land = 起笔过渡占全长的比例（默认 0.10）、lift = 收笔（0.16）、min = 残压下限（默认 0.16）
 * @returns {number} 0..1 的压力（乘在基准宽度上）
 */
export function pressureEnvelope(u, o = {}) {
  const land = clamp(o.land ?? 0.10, 0.002, 0.5);
  const lift = clamp(o.lift ?? 0.16, 0.002, 0.6);
  const min = clamp(o.min ?? 0.16, 0.0, 1);
  const uu = sat(u);
  const rise = sat(uu / land);
  const fall = sat((1 - uu) / lift);
  // 两端都做平方根包络：笔尖接触面积的增长是「圆」的 —— 线性起步会让
  // 起笔处像被削掉一块（出图看是「笔是方的」）。
  const env = Math.min(1, Math.sqrt(rise), Math.sqrt(fall));
  return min + (1 - min) * env;
}

/**
 * 把相邻采样点的宽度逐点夹到 MAX_WIDTH_SLOPE 允许的斜率内。
 *
 * 这是多边形不自交的唯一保证（见文件头第 1 条）。夹法是双向的：先正向扫一遍，
 * 再反向扫一遍 —— 只扫一个方向时，最后一处突起仍会把下一条边推出去。
 *
 * @param {number[]} widths 每点的宽度（本函数不关心单位，只关心相邻差）
 * @param {number} ds 相邻采样点的弧长步进
 * @param {number} [slope] 默认 MAX_WIDTH_SLOPE
 * @returns {number[]} 新的宽度数组（不改入参）
 */
export function clampWidthSlope(widths, ds, slope = MAX_WIDTH_SLOPE) {
  const out = widths.slice();
  const step = Math.max(1e-6, ds) * Math.max(0, slope);
  for (let i = 1; i < out.length; i++) {
    out[i] = clamp(out[i], out[i - 1] - step, out[i - 1] + step);
  }
  for (let i = out.length - 2; i >= 0; i--) {
    out[i] = clamp(out[i], out[i + 1] - step, out[i + 1] + step);
  }
  return out;
}

/** 采样点列的总弧长（内部用；调用方要长度用 polylineLengths）。 */
function evalArc(samples) {
  let L = 0;
  for (let i = 1; i < samples.length; i++) {
    L += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
  }
  return L;
}

/**
 * 压力曲线 -> 采样点：中心线上每一点带自己的宽度、切线与进度。
 *
 * @param {XY[]} pts 中心线（已平滑、已重采样最好；不平也不会崩，但宽度会跳）
 * @param {{
 *   width?: number, minW?: number, land?: number, lift?: number, min?: number,
 *   wobble?: number, wobbleFreq?: number, seed?: number, lean?: number, taper?: number,
 * }} [o]
 * @returns {Sample[]}
 */
export function pressureProfile(pts, o = {}) {
  const width = Math.max(1, Number(o.width ?? 8));
  const minW = Math.max(0.8, Number(o.minW ?? 1.2));
  const wobble = clamp(Number(o.wobble ?? 0.18), 0, 1);
  const freq = Math.max(0.1, Number(o.wobbleFreq ?? 1.7));
  const seed = Number(o.seed ?? 0);
  const lean = clamp(Number(o.lean ?? 0), -1, 1);
  const taper = clamp(Number(o.taper ?? 0), 0, 0.9);
  const n = pts.length;
  if (n === 0) return [];
  const samples = [];
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0.5;
    const env = pressureEnvelope(u, o);
    // 噪声：低频、小幅。用 noise1（不是 hash）—— 手压的起伏是连续的，
    // 逐点取 hash 会让轮廓变成锯齿（看起来像「毛边」而不是「笔压」）。
    const wob = 1 + wobble * (noise1(u * freq * Math.PI * 2 + seed * 7.3) - 0.5) * 2;
    const w0 = width * env * wob * (1 - taper * Math.pow(sat(u), 1.6));
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    samples.push({ x: pts[i][0], y: pts[i][1], w: w0, ang, u, lean });
  }
  const arc = evalArc(samples);
  const avgDs = samples.length > 1 ? Math.max(1e-3, arc / (samples.length - 1)) : width;
  // 夹斜率（见文件头第 1 条）
  const ws = clampWidthSlope(samples.map((s) => s.w), avgDs);
  for (let i = 0; i < samples.length; i++) samples[i].w = Math.max(minW, ws[i]);
  // 下限回填会让两端重新长出陡边（minW 是硬下限），所以再夹一次。
  // 这一步是幂等的：夹完相邻差 <= MAX_WIDTH_SLOPE * ds，且宽度 >= minW。
  const ws2 = clampWidthSlope(samples.map((s) => s.w), avgDs);
  for (let i = 0; i < samples.length; i++) samples[i].w = Math.max(minW, ws2[i]);
  return samples;
}

/* ---------------------------------------------------------------- 3. 轮廓多边形 */

/**
 * 采样点 -> 闭合多边形（上下两条偏移边 + 两端圆头）。
 *
 * 这是「笔迹」与「粗线」的分界：粗线的两端是直角切口，笔迹的两端是圆的。
 * 圆头半径取这一端自己的半宽（文件头第 5 条）。
 *
 * @param {Sample[]} samples
 * @param {{ close?: boolean, lean?: number, capSteps?: number }} [o]
 *   close = true 时首尾相接（画圈 / 画框），不加圆头
 * @returns {XY[]}
 */
export function strokeRing(samples, o = {}) {
  const n = samples.length;
  if (n < 2) {
    // 一个点：画一个小圆点（不是空多边形）—— 「点一下」也是笔迹。
    if (n === 1) {
      const s = samples[0];
      const r = Math.max(0.6, s.w * 0.5);
      const ring = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ring.push([s.x + Math.cos(a) * r, s.y + Math.sin(a) * r]);
      }
      return ring;
    }
    return [];
  }
  const lean = clamp(Number(o.lean ?? samples[0].lean ?? 0), -1, 1);
  const capSteps = Math.max(3, Math.round(o.capSteps ?? 8));
  const left = [];
  const right = [];
  for (const s of samples) {
    const half = Math.max(0.3, s.w * 0.5);
    // 法线：切线逆时针转 90 度。y 向下为正，但这里只关心「两侧各一份」，
    // 方向一致就行（正负没有观感差别）。
    const nx = Math.cos(s.ang + Math.PI * 0.5);
    const ny = Math.sin(s.ang + Math.PI * 0.5);
    // 笔锋偏斜：整个轮廓沿法线平移 lean × 半宽（宽的一侧更靠外）
    const shift = lean * half;
    left.push([s.x + nx * (half + shift), s.y + ny * (half + shift)]);
    right.push([s.x - nx * (half - shift), s.y - ny * (half - shift)]);
  }
  const ring = left.slice();
  if (!o.close) {
    // 收笔圆头：绕末端中心，从 left 侧扫到 right 侧
    const end = samples[n - 1];
    const rEnd = Math.max(0.3, end.w * 0.5);
    for (let i = 1; i < capSteps; i++) {
      const a = end.ang + Math.PI * 0.5 - (i / capSteps) * Math.PI;
      ring.push([end.x + Math.cos(a) * rEnd, end.y + Math.sin(a) * rEnd]);
    }
  }
  for (let i = n - 1; i >= 0; i--) ring.push(right[i]);
  if (!o.close) {
    // 起笔圆头：绕起点中心（方向反过来）
    const st = samples[0];
    const r0 = Math.max(0.3, st.w * 0.5);
    for (let i = 1; i < capSteps; i++) {
      const a = st.ang - Math.PI * 0.5 - (i / capSteps) * Math.PI;
      ring.push([st.x + Math.cos(a) * r0, st.y + Math.sin(a) * r0]);
    }
  }
  return ring;
}

/**
 * 按弧长截断采样点列（逐笔生长的几何）。
 *
 * @param {Sample[]} samples
 * @param {number} k 0..1 的进度
 * @returns {Sample[]} 最后一点是按弧长插值出来的（笔尖位置）
 */
export function revealSamples(samples, k) {
  const n = samples.length;
  const kk = sat(k);
  if (n === 0 || kk <= 0) return [];
  if (kk >= 1) return samples;
  const acc = [0];
  for (let i = 1; i < n; i++) {
    acc.push(acc[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y));
  }
  const total = acc[n - 1] || 1;
  const target = total * kk;
  let i = 1;
  while (i < n - 1 && acc[i] < target) i++;
  const seg = acc[i] - acc[i - 1] || 1;
  const t = sat((target - acc[i - 1]) / seg);
  const a = samples[i - 1], b = samples[i];
  const out = samples.slice(0, i);
  out.push({
    x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t),
    w: lerp(a.w, b.w, t), ang: lerp(a.ang, b.ang, t), u: lerp(a.u, b.u, t),
  });
  return out;
}

/* ---------------------------------------------------------------- 4. 沸腾（可选） */

/**
 * 手绘动画的「重描」抖动：每 2 帧换一次、沿弧长平滑（不是逐点随机）。
 *
 * 为什么不直接复用 boil.js 的 boilOffset：那个是逐段取 hash，沿长度方向是
 * 阶跃 —— 用在等宽折线时看不出（线本来就细），用在**有轮廓的笔迹**上会让上下两条边
 * 各自跳，出图是「锯齿边」（看起来像低分辨率的贴图，而不是手描）。这里沿 u 用噪声，
 * 边界是连续的。
 *
 * @param {Sample[]} samples
 * @param {{ t: number, seed?: number, amp?: number, hz?: number }} o
 *   hz = 每秒重描几次（默认 12，与手绘动画的节奏一致）
 * @returns {Sample[]} 新数组（不改入参）
 */
export function boilSamples(samples, o) {
  const amp = Math.max(0, Number(o.amp ?? 1.4));
  if (!amp) return samples;
  const hz = Math.max(1, Number(o.hz ?? 12));
  const g = Math.floor(Math.max(0, Number(o.t ?? 0)) * hz);
  const seed = Number(o.seed ?? 0);
  return samples.map((s) => {
    const u = s.u * 2.6;
    const dx = (noise1(u + g * 13.7 + seed) - 0.5) * 2 * amp;
    const dy = (noise1(u + g * 9.1 + seed + 55.3) - 0.5) * 2 * amp;
    return { ...s, x: s.x + dx, y: s.y + dy };
  });
}
/* ---------------------------------------------------------------- 5. 画到 lines 上 */

/**
 * 把颜色压成不透明：`inkOn(pen, alpha, paper)`。
 *
 * 为什么不是直接传 alpha 给 fillPoly：一笔的填充由多条扫描线拼成，相邻行之间的
 * 抗锯齿边会叠加（见文件头第 2 条）。半透明墨色会在笔画内部长出横向细纹。
 * 正确的「淡」是**先与纸色混合**，再整块不透明地画上去。
 *
 * @param {number[]} pen 墨色（线性 RGB）
 * @param {number} alpha 0..1
 * @param {number[]} paper 纸色（线性 RGB）
 * @returns {number[]} 不透明的线性 RGB
 */
export function inkOn(pen, alpha, paper) {
  const a = sat(alpha);
  return [
    lerp(paper[0], pen[0], a),
    lerp(paper[1], pen[1], a),
    lerp(paper[2], pen[2], a),
  ];
}

/**
 * **把采样点拆成一段段胶囊**（`lines.seg` 的链），而不是一个填充多边形。
 *
 * 为什么需要这条路 —— 这是本轮最贵的一课，写在这里免得下一个人再撞：
 *
 *   填充轮廓（`strokeRing` + `fillPoly`）**只在「局部曲率半径 >= 半宽」时合法**。
 *   曲率半径比半宽小的地方（拐得比笔还粗的弯、两端圆头相接处），上边与下边的偏移曲线
 *   **必然相交** —— 而 `fillPoly` 是偶奇规则：自交的那一小块被算成「外面」，于是笔画中间
 *   出现一个**针孔**。放大 8 倍看是一个白色像素点，全屏看是「纸上有水渍」。
 *   ⚠ 靠斜率上限（`MAX_WIDTH_SLOPE`）夹不住它：自交来自**曲率**，不是来自宽度跳变。
 *   （实测：一条直角折返的路径，width=6 就已经有 1 处自交。）
 *
 *   胶囊链是逐段画的，每段自带端点（线段着色器画的是胶囊，不是矩形），所以**不存在**
 *   这种自交 —— 代价是段与段之间那个圆接头会**重复覆盖**：相邻两条胶囊的端头叠在一起，
 *   在纯色下看不出来，在半透明下会变深（所以笔迹本来就不许半透明，见文件头第 2 条）。
 *   为了让接缝不出现「针孔」（两条胶囊两侧的内切曲线之间那道缝），这里把每段的端点
 *   **沿切向各外扩半个局部线宽** —— 实测这是唯一能把拐角处的缝补掉的做法。
 *
 * @param {any} lines LineBatch
 * @param {Sample[]} samples
 * @param {{ color?: number[], ratio?: number, extend?: number, outline?: number[], outlineW?: number }} [o]
 *   ratio = 细分的步长 / 局部线宽（默认 0.35；0.5 时拐角处已经能看见针孔）
 *   extend = 每段端点沿切向外扩「局部半宽」的倍数（默认 0.5，= 恰好补掉内切缝）
 * @returns {number} 画了多少段
 */
export function drawStrokeChain(lines, samples, o = {}) {
  const n = samples.length;
  if (n < 2) {
    if (n === 1) {
      const s = samples[0];
      lines.fillCircle(s.x, s.y, Math.max(0.5, s.w * 0.5), o.color || [1, 1, 1], 1);
      return 1;
    }
    return 0;
  }
  const color = o.color || [1, 1, 1];
  const ratio = Math.max(0.1, Number(o.ratio == null ? 0.35 : o.ratio));
  const ext = Math.max(0, Number(o.extend == null ? 0.5 : o.extend));
  const c = [color[0], color[1], color[2], 1];
  let drawn = 0;
  for (let i = 1; i < n; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(L > 1e-6)) continue;
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;
    const wMin = Math.min(a.w, b.w);
    const steps = Math.max(1, Math.ceil(L / Math.max(0.5, wMin * ratio)));
    for (let k = 0; k < steps; k++) {
      const u0 = k / steps;
      const u1 = (k + 1) / steps;
      const wm = a.w + (b.w - a.w) * (u0 + u1) * 0.5;
      const e = ext * wm * 0.5;
      lines.seg(
        a.x + (b.x - a.x) * u0 - ux * e, a.y + (b.y - a.y) * u0 - uy * e,
        a.x + (b.x - a.x) * u1 + ux * e, a.y + (b.y - a.y) * u1 + uy * e,
        wm, c,
      );
      drawn++;
    }
  }
  return drawn;
}

/**
 * **轮廓法什么时候不安全**：局部曲率半径小于这个倍数 × 半宽时，上下两条偏移边必然相交。
 *
 * 判据是几何的、不是经验值：圆角半径 R 的路径，偏移 h 之后内圈半径是 R - h；
 * R < h 时内圈**翻转**（自交）。留一倍余量（采样是折线近似，真实曲率比离散估计更陡）。
 */
export const SELF_INTERSECT_MARGIN = 1.0;

/**
 * 估算采样点列上**每一处的曲率半径**，返回最小那个（Infinity = 全直）。
 *
 * 三个点定一个外接圆：R = |AB||BC||CA| / (2 · |叉积|)。共线时叉积为 0 ⇒ Infinity。
 *
 * @param {Sample[]} samples
 * @returns {number}
 */
export function minCurvatureRadius(samples) {
  let minR = Infinity;
  for (let i = 1; i < samples.length - 1; i++) {
    const a = samples[i - 1], b = samples[i], c = samples[i + 1];
    const ab = Math.hypot(b.x - a.x, b.y - a.y);
    const bc = Math.hypot(c.x - b.x, c.y - b.y);
    const ca = Math.hypot(c.x - a.x, c.y - a.y);
    if (ab < 1e-9 || bc < 1e-9) continue;
    const cross = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    if (cross < 1e-9) continue;
    const R = (ab * bc * ca) / (2 * cross);
    if (R < minR) minR = R;
  }
  return minR;
}

/**
 * 这一笔能不能**安全**地用填充轮廓画（= 曲率半径处处 >= 半宽 × 余量）。
 *
 * 不能的时候**不要**硬填 —— 会出针孔（见 `drawStrokeChain` 的头注释）。
 * `drawStroke` 会自动改用胶囊链，调用方不用处理。
 *
 * @param {Sample[]} samples
 * @param {number} [margin] 默认 `SELF_INTERSECT_MARGIN`
 * @returns {boolean}
 */
export function canFillOutline(samples, margin = SELF_INTERSECT_MARGIN) {
  const R = minCurvatureRadius(samples);
  if (!(R > 0)) return false;
  let maxHalf = 0;
  for (const s of samples) maxHalf = Math.max(maxHalf, s.w * 0.5);
  return R >= maxHalf * margin;
}
/**
 * 画一笔（已经算好的采样点）。
 *
 * @param {any} lines LineBatch
 * @param {Sample[]} samples `pressureProfile` / `revealSamples` 的输出
 * @param {{ color?: number[], step?: number, close?: boolean, lean?: number,
 *           outline?: number[], outlineW?: number }} [o]
 *   step = 扫描行距（默认 1.5；笔画细的时候 1 更准、更贵）
 *   outline = 给一笔描边（可选，一般是更深的同色；**别用半透明**）
 * @returns {number} 画出的多边形点数（0 = 什么都没画）
 */
export function drawStroke(lines, samples, o = {}) {
  const ring = strokeRing(samples, { close: o.close, lean: o.lean });
  if (ring.length < 3) return 0;
  const color = o.color ?? [1, 1, 1];
  // 轮廓法 vs 胶囊链：见 drawStrokeChain 的头注释（曲率半径 < 半宽时轮廓会自交、
  // 偶奇规则把自交处填成针孔）。默认 auto：能填就填（快、边缘是干净的多边形），
  // 拐得太急就自动退到胶囊链 —— 这件事**不该让调用方去判断**。
  const mode = o.fill ?? 'auto';
  const useFill = mode === 'fill' || (mode === 'auto' && canFillOutline(samples));
  if (useFill) {
    lines.fillPoly(ring, [color[0], color[1], color[2], 1], o.step ?? 1.5);
    if (o.outline) {
      const ow = Math.max(0.4, Number(o.outlineW ?? 1));
      const c = o.outline;
      lines.polyline(ring, ow, [c[0], c[1], c[2], 1], true);
    }
    return ring.length;
  }
  const n = drawStrokeChain(lines, samples, { color, ratio: o.chainRatio, extend: o.chainExtend });
  if (o.outline) {
    const ow = Math.max(0.4, Number(o.outlineW ?? 1));
    const c = o.outline;
    lines.polyline(samples.map((s) => [s.x, s.y]), ow, [c[0], c[1], c[2], 1]);
  }
  return n;
}

/**
 * **一行手画的笔**：给中心线的点列，剩下全包（重采样 -> 压力 -> 抖动 -> 截断 -> 填充）。
 *
 * @param {any} lines
 * @param {XY[]} pts 中心线控制点（2 个点就是一根直线段）
 * @param {{
 *   width?: number, minW?: number, color?: number[], reveal?: number, smooth?: boolean,
 *   spacing?: number, step?: number, close?: boolean, outline?: number[], outlineW?: number,
 *   boil?: { t: number, seed?: number, amp?: number, hz?: number },
 *   wobble?: number, wobbleFreq?: number, seed?: number, lean?: number, taper?: number,
 *   land?: number, lift?: number, min?: number,
 * }} [o]
 * @returns {{ samples: Sample[], ring: XY[] }} 已画的几何（要笔尖位置就看 samples 的最后一点）
 */
export function strokePath(lines, pts, o = {}) {
  const src = (pts ?? []).map((p) => [Number(p[0]), Number(p[1])]);
  if (!src.length) return { samples: [], ring: [] };
  // 2 个点就是直线：不做 Catmull-Rom（那会让两端顶出去一点点）
  const smooth = o.smooth ?? src.length > 2;
  const line = smooth ? catmullRom(src, { steps: 10 }) : src;
  const rs = resampleByLength(line, o.spacing ?? 8, { closed: o.close });
  let samples = pressureProfile(rs.pts, o);
  if (o.boil) samples = boilSamples(samples, o.boil);
  samples = revealSamples(samples, o.reveal ?? 1);
  drawStroke(lines, samples, o);
  return { samples, ring: strokeRing(samples, { close: o.close, lean: o.lean }) };
}

/**
 * **一笔写一段圆弧**（手画的圈 / 括号 / 逗号尾）。
 *
 * 与 `lines.circle` 的差别：圆规画的是正圆，手画的是**离心率不为 0 的圈**，
 * 而且起收笔相叠时会粗一点（真实的圈会「收口过头」）。`overshoot` 就是那个过头量：
 * 0.12 = 画到 1.12 圈才停，收笔压在起笔上。
 *
 * @param {any} lines
 * @param {{ cx: number, cy: number, rx: number, ry?: number, rot?: number,
 *           from?: number, to?: number, overshoot?: number, points?: number }} o
 * @param {any} [o2] 传给 strokePath 的其余参数（width / color / reveal / boil …）
 * @returns {{ samples: Sample[], ring: XY[] }}
 */
export function strokeArc(lines, o, o2 = {}) {
  const pts = [];
  const n = Math.max(8, Math.round(o.points ?? 48));
  const from = Number(o.from ?? -Math.PI * 0.75);
  let to = Number(o.to ?? Math.PI * 1.55);
  const over = clamp(Number(o.overshoot ?? 0.10), 0, 1);
  // 收口过头：圆弧多走一点（正数方向）
  if (to > from) to += Math.abs(to - from) * over;
  else to -= Math.abs(to - from) * over;
  const ry = Number(o.ry ?? o.rx ?? 1);
  const rx = Number(o.rx ?? 1);
  const rot = Number(o.rot ?? 0);
  // 手画的圈不是正圆：半径用**低频噪声**摆一点（同一个种子每帧相同）
  const wob = Number(o.wobbleR ?? 0.06);
  const seed = Number(o2.seed ?? 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = from + (to - from) * u;
    const k = 1 + (noise1(u * 2.4 + seed * 3.1) - 0.5) * 2 * wob;
    const ex = Math.cos(a) * rx * k;
    const ey = Math.sin(a) * ry * k;
    pts.push([o.cx + ex * Math.cos(rot) - ey * Math.sin(rot),
      o.cy + ex * Math.sin(rot) + ey * Math.cos(rot)]);
  }
  return strokePath(lines, pts, { ...o2, smooth: false, close: false });
}