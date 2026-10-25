// @ts-check
/**
 * 《把信号拆开》的共用件 —— 这支片子特有的视觉母题，不属于引擎。
 *
 * 一条贯穿全片的母题：**同一条细的基线 + 一个随时刻移动的游标**。
 * 每段都从它长出来（AGENTS.md §4.5 第 ③ 条：一个走完全片的母题，眼睛有得跟）。
 */

import { css } from '../../../src/core/util.js';

/** 全片共用的版面锚点（paper 风格 grid.pad = 140） */
export const L = { x0: 140, x1: 1780, yMid: 540 };

/** 方波的傅里叶系数：f(t) = Σ_{n 奇} (4/πn) sin(nt) */
export function squareCoeffs(count) {
  const C = [];
  for (let n = 1; n < count * 2; n += 2) C.push({ n, r: 4 / (Math.PI * n) });
  return C;
}

/** 只取前 k 项的方波值 */
export function squareWave(t, k, C) {
  let y = 0;
  for (let i = 0; i < k && i < C.length; i++) y += C[i].r * Math.sin(C[i].n * t);
  return y;
}

/**
 * 一条"墨线"的颜色。`lines` 吃**线性**数组，别传 css() 的字符串（会静默变成白色）。
 */
export function ink(P, a = 1) { return [P.bone[0], P.bone[1], P.bone[2], a]; }
export function signal(P, boost = 1, a = 1) {
  return [P.signal[0] * boost, P.signal[1] * boost, P.signal[2] * boost, a];
}
export function muted(P, a = 1) { return [P.ash[0], P.ash[1], P.ash[2], a]; }

/**
 * 把"项数 k 从 1 长到 N"做成时间的函数：前 `ramp` 秒内长满，之后停在 N。
 * 返回**连续**的 k（画圆时用它做透明度）。
 */
export function growK(t, ramp, N) {
  const k = Math.min(1, Math.max(0, t / ramp)) * (N - 1) + 1;
  return Math.min(N, k);
}

/** 一串圆的链：返回每一圈的圆心与半径（从第 i 项累加） */
export function chain(C, k, t) {
  const out = [];
  let x = 0, y = 0;
  for (let i = 0; i < k; i++) {
    const { n, r } = C[i];
    out.push({ x, y, r, i });
    x += r * Math.cos(n * t);
    y += r * Math.sin(n * t);
  }
  return { circles: out, x, y };
}

/** 页脚 / 眉标的统一写法 */
export function slate(type, text, P, x, y, opts = {}) {
  type.writeLine(text, x, y, { size: 24, family: 'mono', color: css(P.ash), ...opts });
}
