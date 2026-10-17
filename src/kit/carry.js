// @ts-check
/**
 * `src/kit/carry.js` —— **衔接（carry）** 的纯函数词表（拆解报告：`docs/REFERENCE-onetake.md` §2.4 / §4）。
 *
 * ## 这层解决什么
 *
 * 「像一支片子而不是幻灯片」的配方在 `src/core/trans.js`（共享背景 / 一台摄影机 / 母题 / 甩走）解决的是
 * **世界不跳**；这里解决的是另一半 —— **内容衔接**：切点上有东西**活下来并变成下一个画面**
 * （按下的按钮展开成窗口、卡片推近成场景、一群元素收拢成标志）。onetake 的验收数据：
 * 同一条片子 v1 carry 0.00 被否 → v3 0.75 通过，而**节奏腿在四版里全都通过** ——
 * 连贯是节奏看不见的另一个维度（判据与盲区见 `docs/REFERENCE-onetake.md` §2）。
 *
 * ## 抄的是什么、不抄什么（许可证红线）
 *
 * 上游 `feitangyuan/onetake` 是 PolyForm **Noncommercial**：**代码、色板字面值一律不抄**。
 * 这里抄的只有**思路 / 词表结构 / 数值口径**（不受版权保护），全部用本仓库的
 * `lerp / remap / spring / ease / keys / hash1` 重写。【外部经验值】的标记逐条写着。
 *
 * ## 边界（与 `motion.js` 同一条纪律）
 *
 * **只 import `../core/util.js`**（纯数学），不碰 GPU / 浏览器 / `ctx` —— 所以
 * `node tools/test-carry.mjs` 能直接测。参数 NaN / ±Inf / 数组混非数字一律**当场抛**：
 * NaN 传到画面里是整屏白，而引擎不报错（`AGENTS.md` §5.5）。要告警就返回
 * `warning` 字段交给调用方 —— **这里只判定，不喊**。
 */

import { lerp, remap, sat, spring, ease, keys, hash1 } from '../core/util.js';

/**
 * carried 判据：移动 ≥ **画面对角线的 2%**（probe 的口径，【外部经验值】，
 * `docs/REFERENCE-onetake.md` §2.2）。给 `anim carry` 的块匹配阈值用。
 */
export const CARRY_MOVE_FRAC = 0.02;

/**
 * carried 判据：缩放 ≥ **10%**（probe 的口径，同上）。
 */
export const CARRY_SCALE_FRAC = 0.10;

/**
 * anchored 判据：幸存者 ≥ **画面的 3%** 且不动（同上）。
 */
export const CARRY_ANCHOR_FRAC = 0.03;

/** 参数必须是有限数：NaN / ±Inf 一路传下去就是整屏白，而且引擎不报错。 */
function need(who, ...vals) {
  for (const v of vals) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError('carry: ' + who + ' 的参数必须是有限数，收到 ' + String(v)
        + ' —— NaN / ±Inf 传下去会变成整屏白，而且引擎不会报错（AGENTS.md §5.5）。');
    }
  }
}

/** 矩形必须是 `[x, y, w, h]` 且数值有限。 */
function needRect(who, r) {
  if (!Array.isArray(r) || r.length !== 4) {
    throw new TypeError('carry: ' + who + ' 的矩形必须是 [x, y, w, h]，收到 ' + String(r) + '。');
  }
  need(who + '.rect', r[0], r[1], r[2], r[3]);
}

/**
 * morphRect：**一个容器自己的形变** —— 从矩形 A 变到矩形 B（位置 / 大小同步插值）。
 *
 * 这是「按下的东西变成结果」那类边界（按钮 → 窗口、卡片 → 页面）的骨架。onetake 用它
 * 做成**一层**（`morphRect` 返回的是同一层在不同时刻的几何），这正是它的 probe 教训：
 * **跨元素合成的 carry 会被判替换** —— 观众看见"卡片变成页面"，量具看见两张图叠着；
 * carry 要做成一个元素自己的形变，量具和眼睛才能对上（`docs/REFERENCE-onetake.md` §2.3①）。
 *
 * 缓动默认 `inOutCubic`；`dur ≤ 0` = 一到 t0 直接跳到 B（落定，不出 NaN）。
 *
 * ```js
 * const m = morphRect(f.lt, 0.6, 0.5, [100, 400, 320, 72], [660, 140, 600, 800]);
 * lines.fillRect(m.x, m.y, m.w, m.h, withAlpha(P.signal, 0.35));   // 同一层，只改几何
 * ```
 *
 * @param {number} t 时间（秒）—— 段内用 `f.lt`
 * @param {number} t0 形变起点
 * @param {number} dur 时长（秒）
 * @param {[number, number, number, number]} A 起始矩形 `[x, y, w, h]`
 * @param {[number, number, number, number]} B 终态矩形 `[x, y, w, h]`
 * @param {{ ease?: keyof typeof ease }} [opts] `ease` 缓动名（默认 `'inOutCubic'`）
 * @returns {{ x: number, y: number, w: number, h: number, k: number }} 当前矩形与进度 k
 */
export function morphRect(t, t0, dur, A, B, opts = {}) {
  need('morphRect', t, t0, dur);
  needRect('morphRect.A', A);
  needRect('morphRect.B', B);
  const k = dur > 0 ? sat((t - t0) / dur) : (t >= t0 ? 1 : 0);
  const f = ease[opts.ease ?? 'inOutCubic'] ?? ease.inOutCubic;
  return {
    x: lerp(A[0], B[0], f(k)),
    y: lerp(A[1], B[1], f(k)),
    w: lerp(A[2], B[2], f(k)),
    h: lerp(A[3], B[3], f(k)),
    k,
  };
}

/**
 * iris：**圆形揭示** —— 半径从 0 打开（或反向收拢）的 0..1 进度，配遮罩 / 描边圆用。
 *
 * 「主体打开自己的世界」：圆心放在主体上，`k` 从 0 到 1 的过程中世界从这一点被揭开。
 * 返回的是**进度**而不是半径 —— 半径取决于你想要多大的画面（对角线、主体尺寸都合理），
 * 引擎不该替你拍板；场景里 `r = k * 1400` 这样乘上去。
 *
 * @param {number} t 时间（秒）
 * @param {number} t0 起始时刻
 * @param {number} dur 时长（秒）；**≤ 0** = 一到 t0 直接全开
 * @param {{ ease?: keyof typeof ease, reverse?: boolean }} [opts]
 *   `reverse: true` = 收拢（1 → 0，圆把世界吞回去）；`ease` 默认 `'inOutCubic'`
 * @returns {{ k: number }} 揭示进度 0..1（`reverse` 时是 1-k）
 */
export function iris(t, t0, dur, opts = {}) {
  need('iris', t, t0, dur);
  let k = dur > 0 ? sat((t - t0) / dur) : (t >= t0 ? 1 : 0);
  k = (ease[opts.ease ?? 'inOutCubic'] ?? ease.inOutCubic)(k);
  return { k: opts.reverse ? 1 - k : k };
}

/**
 * zoomThrough：**推近穿透** —— 把某个矩形推到恰好充满画面的平移 + 缩放。
 *
 * 「众多卡片之一是下一场景」的衔接：`t0` 时刻开始、`dur` 内从全景推到目标卡片充满画面，
 * 穿过它的瞬间切到新段（新段的 `enterOffset` 从反方向接住）。它与 `transitionPass` 互补：
 * 那是「把上一帧甩走」（旧内容的退场），这是「把自己推近成下一个画面」（新内容的入场）。
 *
 * 推近用 `inQuart`（加速感 —— 越近越快），与 `transitionPass` 的 k² 甩出同族。
 * `W/H` 是画面尺寸（逻辑像素），用于算满画面的缩放与居中偏移。
 *
 * ```js
 * const z = zoomThrough(f.lt, 0.4, 0.8, [720, 300, 480, 300], 1920, 1080);
 * // 全层画: 把"这一段所有内容"画在 (z.x, z.y) 处、按 z.s 缩放 —— ctx.setXform 也行:
 * ctx.setXform({ x: z.tx, y: z.ty, scale: z.s });
 * ```
 *
 * @param {number} t 时间（秒）
 * @param {number} t0 推近起点
 * @param {number} dur 推近时长（秒）
 * @param {[number, number, number, number]} target 目标矩形 `[x, y, w, h]`（推到它充满画面）
 * @param {number} W 画面宽（逻辑像素）
 * @param {number} H 画面高（逻辑像素）
 * @returns {{ s: number, tx: number, ty: number, k: number }}
 *   `s/tx/ty` 可直接喂 `ctx.setXform({ x: tx, y: ty, scale: s })`；`k` = 推近进度
 */
export function zoomThrough(t, t0, dur, target, W, H, opts = {}) {
  need('zoomThrough', t, t0, dur, W, H);
  needRect('zoomThrough.target', target);
  const [tx0, ty0, tw0, th0] = target;
  const k = dur > 0 ? sat((t - t0) / dur) : (t >= t0 ? 1 : 0);
  // 对数空间推近（多级缩放读成一个连续手势，与 makeCam 的 zoomLerp 同理）
  const e = (ease[opts.ease ?? 'inQuart'] ?? ease.inQuart)(k);
  const s = 2 ** (lerp(0, Math.log2(Math.max(1e-6, Math.min(W / tw0, H / th0))), e));
  // 满画面时目标中心应到画面中心 ⇒ 平移量随缩放推进
  const cx = tx0 + tw0 / 2, cy = ty0 + th0 / 2;
  return { s, tx: (W / 2 - cx * s) / s, ty: (H / 2 - cy * s) / s, k };
}

/**
 * hop：**弧线跳** —— 从一个点跳到另一个点，抛物线弧 + 弹簧落地。
 *
 * 「主体挑起下一个东西」：元素离开当前槽位、划过一道弧线落进下一个槽位。
 * 水平走 `inOutCubic`（先跟后离），弧高用 `sin(πk)` 峰化（端点为零、中点最高，
 * 不会在出发 / 落地瞬间有垂直速度）。
 *
 * ```js
 * const h = hop(f.lt, 1.2, 0.9, [200, 620], [960, 620], { height: 220 });
 * lines.circle(h.x, h.y, 26, P.bone);      // 落地瞬间配 spring/ring 做挤压
 * ```
 *
 * @param {number} t 时间（秒）
 * @param {number} t0 起跳时刻
 * @param {number} dur 空中时长（秒）
 * @param {[number, number]} from 起点 `[x, y]`
 * @param {[number, number]} to 落点 `[x, y]`
 * @param {{ height?: number }} [opts] 弧高（px，默认 `dist * 0.25`）
 * @returns {{ x: number, y: number, k: number }} 当前位置与进度
 */
export function hop(t, t0, dur, from, to, opts = {}) {
  need('hop', t, t0, dur);
  needRect('hop.from', [from[0], from[1], 0, 0]);
  need('hop.from/to', from[0], from[1], to[0], to[1]);
  const k = dur > 0 ? sat((t - t0) / dur) : (t >= t0 ? 1 : 0);
  const ke = ease.inOutCubic(k);
  const h = opts.height ?? 0.25 * Math.hypot(to[0] - from[0], to[1] - from[1]);
  need('hop.height', h);
  return {
    x: lerp(from[0], to[0], ke),
    y: lerp(from[1], to[1], ke) - h * Math.sin(Math.PI * ke),
    k,
  };
}

/**
 * gather：**收拢** —— 第 i 个（共 n 个）元素沿扇形弧线从 from 到 to 的路径。
 *
 * 「许多变成一组」：一群元素各走各的弧（角度按下标扇形展开 + 微小确定性抖动），
 * 错峰出发（`stagger`）、终点是同一个簇。收拢结束后按 `seal` 式收尾（旋转圆盘），
 * 或直接把簇换成标志 —— 那是场景自己的事，这里只给路径。
 *
 * 抖动用 `hash1(i * 2 + 7)`（确定性，铁律 §4），不引入逐帧随机。
 *
 * ```js
 * // setup 里: this.cast = [...];  render 里:
 * for (let i = 0; i < n; i++) {
 *   const g = gather(f.lt, 3.0, 1.6, i, n, this.cast[i].home, [960, 540]);
 *   lines.circle(g.x, g.y, 20, P.bone);
 * }
 * ```
 *
 * @param {number} t 时间（秒）
 * @param {number} t0 收拢总起点（第 i 个从 `t0 + i*stagger` 才动）
 * @param {number} dur 单个元素自己的行程时长（秒）
 * @param {number} i 当前元素下标（0..n-1）
 * @param {number} n 元素总数
 * @param {[number, number]} from 这个元素的起点
 * @param {[number, number]} to 簇心（所有人共同的落点）
 * @param {{ stagger?: number, arc?: number, spread?: number, seed?: number }} [opts]
 *   `stagger` 错峰（秒，默认 0.05）/ `arc` 弧的弯度 0..1（默认 0.35）/
 *   `spread` 落点在簇心周围的散布半径（px，默认 0 = 全落同一点）——
 *   ⚠ 端点因此是「簇心 + 各自的散布偏移」，不是裸簇心（k=1 时偏移仍在，这是设计：
 *   收拢成的是一**簇**，不是一个点）/ `seed` 抖动种子
 * @returns {{ x: number, y: number, k: number, rot: number }} 当前位置 / 各自进度 / 微旋转
 */
export function gather(t, t0, dur, i, n, from, to, opts = {}) {
  need('gather', t, t0, dur, i, n);
  need('gather.from/to', from[0], from[1], to[0], to[1]);
  const stag = opts.stagger ?? 0.05;
  need('gather.stagger', stag);
  const localT = t - t0 - i * stag;
  const k = dur > 0 ? sat(localT / dur) : (localT >= 0 ? 1 : 0);
  const ke = ease.inOutCubic(k);
  const arc = opts.arc ?? 0.35;
  // 扇形：每个元素按 (i/n) 展开一个法向偏移，中段最大、端点为零
  const ang = (i / Math.max(1, n - 1) - 0.5) * Math.PI;         // -π/2 .. π/2
  const chord = Math.hypot(to[0] - from[0], to[1] - from[1]);
  // 行程窗：中段最大、两端归零 —— 弧高与抖动共用它，端点才能精确落在簇心
  const win = Math.sin(Math.PI * ke);
  const bow = chord * arc * win;
  const jx = (hash1(i * 2 + 7 + (opts.seed ?? 0)) - 0.5) * chord * 0.06 * win;
  const jy = (hash1(i * 2 + 8 + (opts.seed ?? 0)) - 0.5) * chord * 0.06 * win;
  // 落点散布：spread 半径内按 hash 定一个偏移（确定性），k=1 时仍在簇里
  const sp = opts.spread ?? 0;
  const ex = (hash1(i * 5 + 31) - 0.5) * 2 * sp;
  const ey = (hash1(i * 5 + 32) - 0.5) * 2 * sp;
  const dxn = -(to[1] - from[1]) / (chord || 1e-9);
  const dyn = (to[0] - from[0]) / (chord || 1e-9);
  return {
    x: lerp(from[0], to[0] + ex, ke) + dxn * bow + jx * ke,
    y: lerp(from[1], to[1] + ey, ke) + dyn * bow + jy * ke,
    k,
    rot: ang * 0.2 * (1 - ke),
  };
}

/**
 * operatorCam：**操作员手感**的键控摄影机包装 —— `makeCam` 之上的一层配方。
 *
 * one-dot 的教训：定机位版被否「就缺灵动的跟踪运镜」，操作员版通过「运镜镜头物理都没问题」。
 * 配方三条（全部【外部经验值】，`docs/REFERENCE-onetake.md` §4）：
 *
 *   1. **追，不是跟**：key 比主体**提前 `lead` 秒**（默认 0.1s）—— "一帧不落"其实是摄影机先到。
 *   2. **手持浮动在 hold 归零**：慢双正弦浮动，用 `rests`（`[t0,t1]` 数组）包一层
 *      包络 —— **必须死静的地方振幅必须为 0**（浮动着的机位永远不真空静，
 *      静帧判据会把你的 hold 报红，而且报得对：clearing 首渲就死在这条上）。
 *   3. **每次落地配 shake**：`hits`（`[t, amp, decay]` 列表）确定性衰减冲击。
 *
 * 输入一台已建好的 `cam`（`makeCam(...)` 的返回值，`cam.at(t) → {x,y,zoom,rot}`），
 * 输出**每帧可 seek 的纯函数**：`const op = operatorCam(this.cam, { hits: HITS, rests: RESTS });`
 * 然后 `op.at(t)` 直接给 `post` 或 `setXform`。**只吃 t**，绝不累积（铁律 §4）。
 *
 * @param {{ at(t: number): { x: number, y: number, zoom: number, rot?: number } }} cam
 *   `makeCam` 的返回值（或任何同形状的 `at(t)`）
 * @param {{ lead?: number, hits?: [number, number, number][], rests?: [number, number][],
 *   drift?: number, seed?: number }} [opts]
 *   `lead` 提前量秒（默认 0.1）/ `hits` 落地冲击 `[t, amp(px), decay]` /
 *   `rests` 死静区间 `[t0, t1]`（浮动归零）/ `drift` 浮动幅度 px（默认 3）/ `seed` 浮动种子
 * @returns {{ at(t: number): { x: number, y: number, zoom: number, rot: number, driftX: number, driftY: number, shakeX: number, shakeY: number } }}
 */
export function operatorCam(cam, opts = {}) {
  const lead = opts.lead ?? 0.1;
  const driftAmp = opts.drift ?? 3;
  const seed = opts.seed ?? 1;
  need('operatorCam', lead, driftAmp, seed);
  const hits = opts.hits ?? [];
  const rests = opts.rests ?? [];
  return {
    at(t) {
      need('operatorCam.at', t);
      const base = cam.at(t + lead);                       // ① 追：提前 key
      // ② 手持浮动：双正弦（不同频看不出周期），rests 里归零
      let env = 1;
      for (const [r0, r1] of rests) {
        if (t >= r0 - 0.5 && t <= r1 + 0.5) {
          env = Math.min(env, 1 - sat((t - (r0 - 0.5)) / 0.5) * sat(((r1 + 0.5) - t) / 0.5));
        }
      }
      if (!(env > 0)) env = 0;               // 显式归零：rests 里浮动必须是真空静（-0 也不许漏出去）
      // rests 区间内 env 归 0：进 rest 用 0.5s 淡出、出 rest 用 0.5s 淡入（不突跳）
      const dx = env > 0 ? driftAmp * (Math.sin(t * 1.7 + seed) + 0.5 * Math.sin(t * 2.9 + seed * 2)) : 0;
      const dy = env > 0 ? driftAmp * (Math.sin(t * 1.3 + seed + 2) + 0.5 * Math.sin(t * 3.3 + seed)) : 0;
      // ③ 落地 shake：确定性衰减（hit() 的口径），零在 t0 之前
      let sx = 0, sy = 0;
      for (const [ht, amp, decay] of hits) {
        need('operatorCam.hits[]', ht, amp, decay);
        const w = Math.exp(-Math.max(0, t - ht) / Math.max(1e-6, decay));
        if (t < ht) continue;
        sx += amp * w * Math.sin((t - ht) * 47 + hash1(Math.round(ht * 100)) * 6.28);
        sy += amp * w * 0.6 * Math.sin((t - ht) * 39 + hash1(Math.round(ht * 100) + 1) * 6.28);
      }
      return {
        x: base.x + dx + sx,
        y: base.y + dy + sy,
        zoom: base.zoom,
        rot: (base.rot ?? 0) + env * driftAmp * 0.001 * Math.sin(t * 0.9 + seed),
        driftX: dx, driftY: dy, shakeX: sx, shakeY: sy,
      };
    },
  };
}
