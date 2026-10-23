// @ts-check
/**
 * 确定性小工具：**抖动 / 时间窗 / 阶梯出现**。
 *
 * 这三个函数原先在 `blocks.js` 与 `panel.js` 里各有一份**逐字相同**的实现
 * （`docs/history/IMPROVEMENTS-4-5.md` 抽 panel 层时留下的）。两份实现意味着
 * 改一处、漏一处 —— 统一收到这里，两边只做再导出。
 *
 * 全部只吃参数、不碰 GPU，也可以在场景里直接 import。
 */

import { hash1, sat } from '../core/util.js';

/** 一个确定性的抖动（`hash1` 播种）—— 给"很多个一样的东西"加个体差异。 */
export function jitter(i, k = 0, amp = 1) {
  return (hash1(i * 131.7 + k * 17.3) - 0.5) * 2 * amp;
}

/** 这一帧要不要画某样东西（按整片时间的窗口函数，两端各用 `fade` 秒平滑进出）。 */
export function win(t, a, b, fade = 0.4) {
  return sat((t - a) / fade) * sat((b - t) / fade);
}

/** 阶梯式出现：第 n 个元素在 `t0 + n*step` 之后用 `dur` 秒出现（0..1）。 */
export function step(t, t0, n, stepS = 0.18, dur = 0.45) {
  return sat((t - t0 - n * stepS) / dur);
}
