// @ts-check
/**
 * 母题：**傅里叶拆方波**（BACKLOG 1-49）。
 *
 * 从 `tasks/spectrum/scenes/_kit.js` 抽出来的 —— 那一支片子（《把信号拆开》）里
 * 「方波 → 一串圆 → 正弦叠加」是贯穿全片的视觉主线，每个镜头都重抄一遍这几行数学。
 * 抽进引擎之后，下一支讲"信号 / 近似 / 叠加"的片子可以直接：
 *
 * ```js
 * import { squareCoeffs, squareWave, epicycles, growK } from '../../../src/kit/index.js';
 * const C = squareCoeffs(8);                    // 8 项奇次谐波
 * const k = growK(t, 2.4, C.length);            // 前 2.4 秒把项数从 1 长到 8
 * const { circles, x, y } = epicycles(C, k, t); // 一串圆 + 末端点（笔尖）
 * const v = squareWave(t, k, C);                // 同一时刻的波形值（-1..1）
 * ```
 *
 * **全部是纯函数**：确定性、无 DOM、无 GPU —— 所以 `tools/test-motifs.mjs` 能直接测。
 */

/**
 * 方波的傅里叶系数：`f(τ) = Σ_{n 奇} (4/πn) · sin(nτ)`。
 *
 * 为什么只取奇次项：方波是奇函数、半个周期反对称，偶次项恒为 0。
 *
 * @param {number} count 要几项（1 项 = 一个正弦，8 项已经很像方波了）
 * @returns {{ n: number, r: number }[]} `n` 是谐波次数（1,3,5…），`r` 是振幅 `4/(πn)`
 */
export function squareCoeffs(count) {
  const C = [];
  for (let n = 1; n < count * 2; n += 2) C.push({ n, r: 4 / (Math.PI * n) });
  return C;
}

/**
 * 只取前 `k` 项时，方波在 `t` 时刻的值（值域约 -1.18 … 1.18，含 Gibbs 过冲）。
 * @param {number} t 相位（弧度；画面里一般用 `f.lt * 2π * 频率`）
 * @param {number} k 取几项（可以是小数 —— 用 `growK()` 拿连续值做淡入）
 * @param {{ n: number, r: number }[]} C `squareCoeffs()` 的结果
 */
export function squareWave(t, k, C) {
  let y = 0;
  for (let i = 0; i < k && i < C.length; i++) y += C[i].r * Math.sin(C[i].n * t);
  return y;
}

/**
 * 「项数从 1 长到 N」做成时间的函数：前 `ramp` 秒长满，之后停在 N。
 * 返回**连续**值（画圆时拿它做透明度/半径权重）。
 * @param {number} t 段内时间
 * @param {number} ramp 长满需要几秒
 * @param {number} N 总项数
 */
export function growK(t, ramp, N) {
  const k = Math.min(1, Math.max(0, t / ramp)) * (N - 1) + 1;
  return Math.min(N, k);
}

/**
 * 一串首尾相接的圆（外摆线 / 本轮），以及末端"笔尖"的位置。
 *
 * 每一项 `n` 是一个半径 `r` 的圆，圆心在上一项的末端；笔尖 = 所有向量之和。
 * 第 `i` 项的圆心落在 `Σ_{j<i} r_j·(cos, sin)(n_j t)` —— 与 `squareWave()` 同一个级数，
 * 所以笔尖的 y 值恒等于 `squareWave(t, k, C)`（`tools/test-motifs.mjs` 钉住这一条）。
 *
 * @param {{ n: number, r: number }[]} C
 * @param {number} k 取几项（小数可以，用于"长出来"的过程）
 * @param {number} t 相位
 * @returns {{ circles: { x: number, y: number, r: number, i: number }[], x: number, y: number }}
 */
export function epicycles(C, k, t) {
  const out = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < k && i < C.length; i++) {
    const { n, r } = C[i];
    out.push({ x, y, r, i });
    x += r * Math.cos(n * t);
    y += r * Math.sin(n * t);
  }
  return { circles: out, x, y };
}

/**
 * 把 `epicycles()` 的结果画成矢量（一串圆 + 末端连线），一次 `begin/flush`。
 *
 * 颜色吃**线性**数组（`lines` 的规矩）：传 `css()` 的字符串会静默变白。
 *
 * @param {any} lines LineBatch（`ctx.lines`）
 * @param {{x:number,y:number,r:number}[]} circles
 * @param {{ cx:number, cy:number, scale?:number, width?:number, target?:any,
 *           color?:number[], accent?:number[], pen?:number[], lastN?:number }} o
 *   `cx/cy` 是第 0 个圆的圆心；`scale` 是每单位振幅多少像素；`lastN` = 只把最后 N 个圆画成信号色；
 *   **`target` 必须传 `ctx.out`** —— `lines.flush()` 不传目标会画到引擎默认目标（症状：文字在、线没了）
 */
export function drawEpicycles(lines, circles, o) {
  const { cx, cy, scale = 200, width = 1.5, color, accent, pen, lastN = 1 } = o;
  lines.begin();
  for (let i = circles.length - 1; i >= 0; i--) {
    const c = circles[i];
    const isLast = i >= circles.length - lastN;
    const col = isLast && accent ? accent : color;
    lines.circle(cx + c.x * scale, cy - c.y * scale, c.r * scale, width, col);
  }
  if (pen) {
    const tip = circles[circles.length - 1];
    if (tip) lines.seg(cx + tip.x * scale, cy - tip.y * scale, cx + tip.x * scale, cy, width, pen);
  }
  lines.flush(o.target ?? null);
}
