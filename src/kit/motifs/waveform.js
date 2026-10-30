// @ts-check
/**
 * 母题：**一条波形 + 游标 + 刻度**（BACKLOG 1-49）。
 *
 * 每个"讲信号"的镜头都在重写同样三件事：把函数采样成折线、在某个位置画游标、
 * 沿基线打刻度。抽出来之后一个镜头只剩「给 fn + 给颜色」。
 *
 * ```js
 * import { wavePoints, drawWave, drawTicks, playheadX } from '../../../src/kit/index.js';
 * const pts = wavePoints({ x0: 140, x1: 1780, yMid: 640, amp: 180, fn: (τ) => Math.sin(τ * 2) });
 * drawWave(ctx.lines, pts, { width: 3, color: signal(P) });
 * ```
 *
 * 全部纯函数（`drawWave` 除了 `lines` 之外没有副作用），`tools/test-motifs.mjs` 直接测。
 */

/**
 * 把一个 `fn(τ)` 采样成折线点。
 *
 * ⚠ 不要在里面塞 `Math.random()`（AGENTS.md §4 铁律第 1 条）：折线每帧都会被重算，
 * 一帧内多个子帧也会各调一次 —— 要抖动请用 `noise1(f.t)` 这种**时间的纯函数**。
 *
 * @param {{ x0: number, x1: number, yMid: number, amp: number,
 *           fn: (tau: number) => number, samples?: number,
 *           tau0?: number, tau1?: number, clamp?: boolean }} o
 *   `tau0..tau1` 是喂给 `fn` 的相位区间（默认 0..2π）；`clamp` 把 y 夹在 ±1.25 之内
 * @returns {{ x: number, y: number }[]}
 */
export function wavePoints(o) {
  const { x0, x1, yMid, amp, fn } = o;
  const samples = Math.max(2, Math.round(o.samples ?? 720));
  const tau0 = o.tau0 ?? 0;
  const tau1 = o.tau1 ?? Math.PI * 2;
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const tau = tau0 + (tau1 - tau0) * u;
    let v = fn(tau);
    if (!Number.isFinite(v)) v = 0;                       // 别把 NaN 画进顶点缓冲
    if (o.clamp) v = Math.max(-1.25, Math.min(1.25, v));
    pts.push({ x: x0 + (x1 - x0) * u, y: yMid - v * amp });
  }
  return pts;
}

/**
 * 游标 x：`phase` 是 0..1 的进度（一般用 `f.p` 或 `f.lt / dur`）。
 * @param {number} x0 @param {number} x1 @param {number} phase
 */
export function playheadX(x0, x1, phase) {
  const k = Math.max(0, Math.min(1, Number(phase) || 0));
  return x0 + (x1 - x0) * k;
}

/**
 * 画一条折线（一次 `polyline`）。
 * @param {any} lines
 * @param {{x:number,y:number}[]} pts
 * @param {{ width?: number, color?: number[], closed?: boolean }} [o]
 */
export function drawWave(lines, pts, o = {}) {
  lines.polyline(pts.map((p) => [p.x, p.y]), o.width ?? 2, o.color ?? [1, 1, 1, 1], !!o.closed);
  return pts;
}

/**
 * 沿基线打刻度（每 `step` 像素一根小竖线）。
 * @param {any} lines
 * @param {{ x0:number, x1:number, y:number, step?:number, len?:number,
 *           width?:number, color?:number[] }} o
 */
export function drawTicks(lines, o) {
  const step = o.step ?? 80;
  const len = o.len ?? 8;
  for (let x = o.x0; x <= o.x1 + 1e-6; x += step) {
    lines.seg(x, o.y - len, x, o.y + len, o.width ?? 1, o.color ?? [1, 1, 1, 0.35]);
  }
}
