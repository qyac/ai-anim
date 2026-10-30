// @ts-check
/**
 * 母题：**8×8 块的 DCT / IDCT**（BACKLOG 1-49）。
 *
 * 从 `tasks/spectrum/scenes/keep.js` 抽出来 —— 那一段"只留低频它变糊、只留高频只剩边"
 * 用的是**真的二维 DCT**，不是滤镜：糊与锐是变换本身的结论。这类"压缩 / 频谱 / 有损"
 * 题材以后还会写，所以把块变换与"重建并归一化"这两步抽成纯函数。
 *
 * ```js
 * import { dct2, idct2, normalizeBlock } from '../../../src/kit/index.js';
 * const C = dct2(block);                         // 64 个系数 { u, v, c }
 * const low = C.filter((c) => c.u <= 1 && c.v <= 1);
 * const img = normalizeBlock(idct2(low));        // 0..1，可以直接当亮度画格子
 * ```
 */

/** 默认块边长（JPEG 的 8×8） */
export const DCT_BLOCK = 8;

/**
 * 二维 DCT-II（正交归一化，与 JPEG 同口径）。
 * @param {number[][]} block `N×N`，`block[x][y]`
 * @param {number} [N]
 * @returns {{ u: number, v: number, c: number }[]}
 */
export function dct2(block, N = DCT_BLOCK) {
  const out = [];
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let s = 0;
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          s += block[x][y]
            * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N))
            * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
        }
      }
      const cu = u === 0 ? Math.SQRT1_2 : 1;
      const cv = v === 0 ? Math.SQRT1_2 : 1;
      out.push({ u, v, c: 0.25 * cu * cv * s });
    }
  }
  return out;
}

/**
 * 二维 IDCT（`dct2()` 的逆）。只传一部分系数就是"有损重建"。
 * @param {{ u: number, v: number, c: number }[]} coef
 * @param {number} [N]
 * @returns {number[][]} `N×N`，`[x][y]`
 */
export function idct2(coef, N = DCT_BLOCK) {
  const b = [];
  for (let x = 0; x < N; x++) {
    const row = [];
    for (let y = 0; y < N; y++) {
      let s = 0;
      for (const { u, v, c } of coef) {
        const cu = u === 0 ? Math.SQRT1_2 : 1;
        const cv = v === 0 ? Math.SQRT1_2 : 1;
        s += cu * cv * c
          * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N))
          * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
      }
      row.push(0.25 * s);
    }
    b.push(row);
  }
  return b;
}

/**
 * 把块按**自己的** min/max 拉伸到 0..1。
 *
 * ⚠ 这一步看着像"作弊"，其实是必须的：只留高频时重建出来的值域只有 ±0.3
 * （高频没有"亮度"、只有"边缘"），不拉伸就只是一块几乎全黑的格子，什么都看不出来。
 * 拉伸只改对比度、不改形状 —— 形状是变换算出来的。
 *
 * @param {number[][]} block
 * @returns {number[][]}
 */
export function normalizeBlock(block) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const row of block) {
    for (const v of row) { if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  const span = hi - lo;
  if (!(span > 0)) return block.map((row) => row.map(() => 0.5));
  return block.map((row) => row.map((v) => (v - lo) / span));
}
