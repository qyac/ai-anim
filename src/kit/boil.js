// @ts-check
/**
 * `src/kit/boil.js` —— **线条沸腾（line boil）**：手绘感的引擎级原语。
 *
 * 手绘动画里线条不是静止的：同一根线每 2 帧被重描一次，位置有几像素的抖动。
 * 这一层就是那个抖动 —— 但必须是**确定性的**（`render(t)` 是纯函数，可 seek、可并行子帧），
 * 所以抖动量来自 `hash2(帧组号, 线号)`，不是随机数。
 *
 * 两条纪律（违反就没手绘感了）：
 *   · **每 2 帧换一次**（12fps 的描线节奏）：`const g = Math.floor(t * 12)`，不是每帧换；
 *   · **每根线的抖动必须独立**：用线自己的编号当种子，否则整张图会像被整体平移。
 *
 * ```js
 * import { boilSeg, boilCircle } from '../kit/boil.js';
 * boilSeg(lines, x0, y0, x1, y1, 3, P.bone, { t: f.t, seed: 7, amp: 1.6 });
 * ```
 */

import { hash2 } from '../core/util.js';

/** 描线节奏：一秒换几次抖动量（手绘一般 12，动画在 2s 上 = 每秒 12 次重描） */
export const BOIL_STEP = 12;

/** 当前这一拍（帧组）的编号 */
export function boilGroup(t) {
  return Math.floor(t * BOIL_STEP);
}

/** 某个（组, 种子）的确定性抖动向量，返回 [-1,1] 的 dx / dy */
export function boilOffset(t, seed = 0, amp = 1) {
  const g = boilGroup(t);
  return [
    (hash2(g, seed) - 0.5) * 2 * amp,
    (hash2(g, seed + 101.3) - 0.5) * 2 * amp,
  ];
}

/**
 * 画一根**会沸腾的线**：把它切成几段，每段端点各自抖 —— 于是线不只会平移，还会轻微起伏。
 * @param {any} lines LineBatch
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {number} w 线宽
 * @param {number[]} color 线性色（可带 a）
 * @param {{ t: number, seed?: number, amp?: number, parts?: number }} o
 */
export function boilSeg(lines, x0, y0, x1, y1, w, color, o) {
  const t = o.t, seed = o.seed ?? 0, amp = o.amp ?? 1.5;
  const parts = Math.max(1, Math.round(o.parts ?? Math.max(2, Math.hypot(x1 - x0, y1 - y0) / 90)));
  for (let i = 0; i < parts; i++) {
    const k0 = i / parts, k1 = (i + 1) / parts;
    const [dxa, dya] = boilOffset(t, seed + i, amp);
    const [dxb, dyb] = boilOffset(t, seed + i + 1, amp);
    lines.seg(
      x0 + (x1 - x0) * k0 + dxa, y0 + (y1 - y0) * k0 + dya,
      x0 + (x1 - x0) * k1 + dxb, y0 + (y1 - y0) * k1 + dyb,
      w, color,
    );
  }
}

/** 会沸腾的圆：按角分片，每片半径各自抖一点（手绘圆永远不圆） */
export function boilCircle(lines, cx, cy, r, w, color, o) {
  const t = o.t, seed = o.seed ?? 0, amp = o.amp ?? 1.5;
  const parts = Math.max(8, Math.round(o.parts ?? r * 0.5));
  for (let i = 0; i < parts; i++) {
    const a0 = (i / parts) * Math.PI * 2, a1 = ((i + 1) / parts) * Math.PI * 2;
    const r0 = r + (hash2(boilGroup(t), seed + i) - 0.5) * 2 * amp;
    const r1 = r + (hash2(boilGroup(t), seed + i + 1) - 0.5) * 2 * amp;
    lines.seg(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, w, color);
  }
}

/** 会沸腾的折线（一条路径：给点列，逐段画） */
export function boilPath(lines, pts, w, color, o) {
  for (let i = 0; i < pts.length - 1; i++) {
    boilSeg(lines, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, color, { ...o, seed: (o.seed ?? 0) + i * 13 });
  }
}
