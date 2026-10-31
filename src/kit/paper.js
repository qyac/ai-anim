// @ts-check
/**
 * 剪纸 / 纸艺层叠（BACKLOG 1-49 能力缺口表第 5 行；覆盖素材包 20 条：E2 K20 K21 K22 L24 L26 L27
 * L37 M12 O17 O41 O57 O67 O73 O94 Z5 Z6 Z7 Z8 Z11）。
 *
 * **这套东西解决的是「纸看起来是纸」**，不是「多层视差」（那是 `ctx.setXform` 与
 * `src/kit/world.js` 的事）。一张纸要像纸，只有三件事，缺一件就变成「彩色多边形」：
 *
 *   ① **硬投影**：剪纸是**贴**在下一层上的，光有方向，影子边缘**硬**（不是 blur）。
 *      软阴影会立刻让人读成「UI 卡片」。
 *   ② **撕边**：边缘不是直线也不是规则波浪，是**分形**的（`fbm1` 每个采样点重新取值）；
 *      而且撕口有**两层** —— 纸的正面轮廓 + 底下那层露出来的白芯。
 *   ③ **纸色不纯**：纸是有纤维的，同一种纸的明度在 ±2% 之间游走；纯色填充一看就是代码画的。
 *
 * ## 为什么不是一个 `paperLayer()` 一把梭
 *
 * 每支片子的纸都要自己定形状（山、浪、房间、云）。这里只给**四块可以组合的件**，
 * 形状永远由调用方给：
 *
 *   · `tornEdge()`     —— 一条分形撕边（返回点列，直接喂 `fillPoly` / `polyline`）
 *   · `paperShape()`  —— 一个带撕边的闭合纸片（形状 + 撕边 + 白芯）
 *   · `paperStack()`  —— 层栈：由远到近排、每层按视差偏移、每层都有硬投影
 *   · `paperGrain()`  —— 一张纸的纤维明度扰动（给填充色乘一个 ±2% 的噪声）
 *
 * ⚠ **不要每帧重算撕边**：`fbm1` 每个点要叠 4 个八度，一条 200 点的边就是 800 次噪声；
 *   而撕边**不该逐帧变**（纸不会呼吸）。在 `setup` 里算一次、存下来，每帧只做平移。
 *   唯一该逐帧变的是「层在动」（视差）与「影子的方向」（如果光在动）。
 *
 * ⚠ **硬投影的偏移方向必须全片一致**：一支片子里三层纸各往不同方向投影 = 光源在打架。
 *   默认 `light: [-1, -1]`（光从左上来），整片都用默认值就对了。
 */

import { fbm1, sat, clamp } from '../core/util.js';

/**
 * 硬投影的颜色：不是「半透明黑」，是「纸压住的地方本来就更暗」（乘性）。
 *
 * 为什么不用 alpha 黑：`lines` 的柔边在相邻扫描行之间会叠加（见 `src/shots/layers.js` 的注释），
 * 一行一行铺出来的填充如果用半透明，行与行之间会出现**横向条纹**。所以投影一律用
 * **不透明**的调暗色，由 `shadowColor()` 从纸色算出来。
 *
 * @param {number[]} paperColor 被压住那层的纸色（线性 RGB）
 * @param {number} [amount] 压暗多少（0.55 = 剩 55% 亮度）
 * @returns {number[]} 不透明的线性 RGB
 */
export function shadowColor(paperColor, amount = 0.55) {
  const k = clamp(amount, 0, 1);
  return [paperColor[0] * k, paperColor[1] * k, paperColor[2] * k];
}

/**
 * **一条分形撕边** —— 返回沿一条基线分布的点列（直接喂 `fillPoly` 的边界）。
 *
 * 撕边的本质是**分形**：大尺度上是走向（这一整条边往哪偏），中尺度上是「撕的节奏」，
 * 小尺度上是纸纤维的毛刺。三层缺一层就不像：只有大尺度 = 波浪线，只有小尺度 = 噪声线。
 *
 * ⚠ **确定性**：只吃 `seed`，不吃 `t`。纸不会每帧重新撕一遍 —— 这既是物理事实，
 *   也是引擎「每帧是 t 的纯函数」的硬要求（撕边逐帧变 = 抖动 = 子帧累加后糊成一团）。
 *
 * @param {{
 *   x0: number, y0: number, x1: number, y1: number,
 *   amp?: number,
 *   freq?: number,
 *   rough?: number,
 *   roughFreq?: number,
 *   steps?: number,
 *   seed?: number,
 * }} o
 * @returns {{ pts: number[][], normal: number[] }}
 */
export function tornEdge(o) {
  const { x0, y0, x1, y1 } = o;
  const amp = o.amp ?? 14;
  const freq = o.freq ?? 2.2;
  const rough = o.rough ?? 2.5;
  const roughFreq = o.roughFreq ?? 26;
  const steps = Math.max(4, Math.round(o.steps ?? 96));
  const seed = o.seed ?? 0;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / len;
  const ny = dx / len;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    // 两端收敛到基线上：撕边是从纸的边缘起头的，不是凭空鼓起来
    const taper = Math.sin(Math.PI * u) ** 0.55;
    const big = fbm1(u * freq + seed * 7.13, 4) - 0.5;
    const small = fbm1(u * roughFreq + seed * 3.77, 2) - 0.5;
    const off = (big * amp + small * rough) * taper;
    pts.push([x0 + dx * u + nx * off, y0 + dy * u + ny * off]);
  }
  return { pts, normal: [nx, ny] };
}

/**
 * **一个带撕边的闭合纸片** —— 四条边各撕一次，返回外轮廓 + 内轮廓（白芯）。
 *
 * 为什么要有白芯：真剪纸撕开之后，撕口会露出**纸的芯**（比正面浅）。只画一层外轮廓，
 * 撕边就只是一条锯齿线；多一条内轮廓（往内缩 `core` 像素、颜色更浅），撕口才有厚度。
 * 这一条是这套东西里最容易被忽略、又最出效果的一件事。
 *
 * @param {{
 *   x: number, y: number, w: number, h: number,
 *   amp?: number, rough?: number, roughFreq?: number,
 *   steps?: number,   // 默认按边长自动定（约 8px 一个采样点）—— **别传小值**，会抹平毛刺
 *   seed?: number,
 *   core?: number,
 *   jitter?: number,
 * }} o
 * @returns {{ outer: number[][], inner: number[][] }}
 */
export function paperShape(o) {
  const { x, y } = o;
  const w = o.w;
  const h = o.h;
  const amp = o.amp ?? 10;
  const rough = o.rough ?? 2;
  const roughFreq = o.roughFreq ?? 26;
  /**
   * ⚠ **采样点数必须跟边长走**，不能给一个常数。
   *
   * 第一版默认 40：一条 2040px 的边每 **51px** 才落一个点，而小尺度毛刺的周期是
   * `边长 / roughFreq`（默认 26 ⇒ 78px）—— 一个毛刺只摊到 1.5 个点，`fillPoly` 把它们
   * 连成折线之后**毛刺就没了**，出来的是一条几乎笔直的边（出图放大才看出来）。
   * 现在按 **约 8px 一个点** 自动定，`steps` 只做显式覆盖。
   */
  const steps = Math.max(8, Math.round(o.steps ?? Math.max(w, h) / 8));
  const seed = o.seed ?? 0;
  const core = Math.max(0, o.core ?? 3);
  const jit = o.jitter ?? 6;
  // 四个角各抖一点：机器画的矩形太直，抖过之后才像手撕下来的
  const j = (i) => (fbm1(i * 11.7 + seed * 5.1, 2) - 0.5) * 2 * jit;
  const corners = [
    [x + j(0), y + j(4)],
    [x + w + j(1), y + j(5)],
    [x + w + j(2), y + h + j(6)],
    [x + j(3), y + h + j(7)],
  ];
  const outer = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const e = tornEdge({
      x0: a[0], y0: a[1], x1: b[0], y1: b[1],
      amp, rough, roughFreq, steps, seed: seed * 17 + i,
    });
    // 每条边去掉最后一个点（与下一条边的第一个点重合）
    outer.push(...e.pts.slice(0, -1));
  }
  // 内缩按包围盒中心等比缩 —— 撕边各段法线方向不同，等比缩最稳（不会自交）
  const mx = x + w / 2;
  const my = y + h / 2;
  const sx = Math.max(0, 1 - (core * 2) / Math.max(w, 1e-6));
  const sy = Math.max(0, 1 - (core * 2) / Math.max(h, 1e-6));
  // core = 0 ⇒ 白芯就是纸本身，直接复用同一组点（等比缩再乘 1 会有浮点误差，出图看不出来，
  // 但会让"白芯关掉"这件事在单测里不可断言 —— 也白白多算 1000 个点）
  const inner = core === 0 ? outer : outer.map(([px, py]) => [mx + (px - mx) * sx, my + (py - my) * sy]);
  return { outer, inner };
}

/**
 * 白芯色：纸的**芯**比正面浅一点点，就一点点。
 *
 * ⚠ 这里踩过一次：第一版提亮 **35%**，出图是一条雪白的高光带 —— 读起来像"贴纸的白边"，
 *   完全不像撕口。真实的纸芯只浅 **5–9%**（纸是两次上浆的，芯和面的色差很小）。
 *   这个数**调大就毁**，别为了"看得见"往上加；看不清就加 `core` 宽度，不是加亮度。
 *
 * @param {number[]} color 纸色（线性 RGB）
 * @param {number} [amount] 提亮多少（默认 1.07 = 浅 7%）
 */
export function coreColorOf(color, amount = 1.07) {
  return [sat(color[0] * amount), sat(color[1] * amount), sat(color[2] * amount)];
}

/**
 * **一层纸**：填外轮廓 → 填白芯 → 描一道压痕。
 *
 * 顺序不能换（线段批没有 z-test，画家算法）：**先画投影、再画纸、最后画白芯**。
 * 描边**只在需要「压痕」时**加 —— 每一层都描边会让画面变成贴纸拼贴，不是剪纸。
 *
 * @param {import('../core/gl.js').LineBatch} lines
 * @param {{ outer: number[][], inner: number[][] }} shape `paperShape()` 的返回
 * @param {{
 *   color: number[],
 *   coreColor?: number[],
 *   shadow?: number[] | null,
 *   edge?: number[] | null,
 *   step?: number,
 * }} o
 */
export function paperFace(lines, shape, o) {
  const step = o.step ?? 3;
  if (o.shadow) lines.fillPoly(shape.outer, o.shadow, step);
  lines.fillPoly(shape.outer, o.color, step);
  lines.fillPoly(shape.inner, o.coreColor ?? coreColorOf(o.color), step);
  if (o.edge) lines.polyline(shape.outer, 1, o.edge, true);
}

/**
 * 形状平移（**返回新对象**，不改原对象 —— 层栈每帧都要算一次，改原对象会把偏移累积起来）。
 * @param {{ outer: number[][], inner: number[][] }} shape
 * @param {number} dx @param {number} dy
 */
export function translateShape(shape, dx, dy) {
  const mv = (pts) => pts.map(([x, y]) => [x + dx, y + dy]);
  return { outer: mv(shape.outer), inner: mv(shape.inner) };
}

/**
 * **层栈**：由远到近排好的几张纸，每层按视差偏移、每层都有硬投影。
 *
 * 视差的物理直觉：远处的层动得慢、近处的层动得快。这里用 `depth`（0 = 最远，1 = 最近）
 * 直接乘一个位移量 —— **位移必须由调用方给成 t 的函数**（引擎硬要求，见 AGENTS §4）。
 *
 * ⚠ **投影偏移不跟着视差走**：光是同一个光源，影子方向全片一致；跟着走的只有纸自己。
 *
 * @param {import('../core/gl.js').LineBatch} lines
 * @param {Array<{
 *   shape: { outer: number[][], inner: number[][] },
 *   color: number[],
 *   depth?: number,
 *   coreColor?: number[],
 *   edge?: number[] | null,
 * }>} layers
 * @param {{
 *   pan?: number[],
 *   parallax?: number,
 *   light?: number[],
 *   shadowDist?: number,
 *   shadowAmount?: number,
 *   step?: number,
 * }} [o]
 */
export function paperStack(lines, layers, o = {}) {
  const pan = o.pan ?? [0, 0];
  const parallax = o.parallax ?? 0;
  const light = o.light ?? [-1, -1];
  const shadowDist = o.shadowDist ?? 10;
  const shadowAmount = o.shadowAmount ?? 0.55;
  const step = o.step ?? 3;
  const n = layers.length;
  const ll = Math.hypot(light[0], light[1]) || 1;
  const lx = light[0] / ll;
  const ly = light[1] / ll;
  // 由远到近（画家算法）
  const order = layers
    .map((L, i) => ({ L, i, d: L.depth ?? (n === 1 ? 1 : i / (n - 1)) }))
    .sort((a, b) => a.d - b.d);
  for (const { L, d } of order) {
    // 近的层动得多
    const k = 0.35 + 0.65 * d;
    const dx = pan[0] * k + (d - 0.5) * parallax;
    const dy = pan[1] * k;
    const shifted = translateShape(L.shape, dx, dy);
    // 投影先画（它在纸下面）：往光源的反方向落
    const sh = translateShape(shifted, -lx * shadowDist, -ly * shadowDist);
    lines.fillPoly(sh.outer, shadowColor(L.color, shadowAmount), step);
    lines.fillPoly(shifted.outer, L.color, step);
    lines.fillPoly(shifted.inner, L.coreColor ?? coreColorOf(L.color), step);   // ⚠ 只浅 7%，见 coreColorOf
    if (L.edge) lines.polyline(shifted.outer, 1, L.edge, true);
  }
}

/**
 * **纸的纤维**：给一个纸色乘上 ±`amp` 的确定性噪声，返回新颜色。
 *
 * 为什么需要：纯色填充一眼就是代码画的。真实的纸同一种纸在 ±2% 之间游走（纤维 + 上浆不均）。
 * 幅度**别超过 0.04** —— 再大就成了「脏」而不是「纸」。
 *
 * ⚠ 噪声只吃坐标，**不吃 t**：纸的纤维不会动。想要「纸在动」就动层，别动纤维。
 *
 * @param {number[]} color 纸色（线性 RGB）
 * @param {number} x @param {number} y 采样坐标（通常给纸的包围盒左上角）
 * @param {{ amp?: number, scale?: number, seed?: number }} [o]
 * @returns {number[]}
 */
export function paperGrain(color, x, y, o = {}) {
  const amp = o.amp ?? 0.025;
  const scale = o.scale ?? 0.08;
  const seed = o.seed ?? 0;
  const n = fbm1(x * scale + y * scale * 0.37 + seed * 13.1, 2) - 0.5;
  const k = 1 + n * 2 * amp;
  return [color[0] * k, color[1] * k, color[2] * k];
}
