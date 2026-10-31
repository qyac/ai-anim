// @ts-check
/**
 * 多方向排线标定场景：一块**从白到黑**的渐变 + 三个面 + 一行大字。
 *
 * 为什么不用现成模板当夹具：模板自带底纹与细线，排线会去刻那些底纹，
 * 出图变成"满屏细网"，看不出「按明暗加方向」这件事。这里只要**色调**，
 * 排版元件越少越好 —— 排线自己就是画面。
 */
import { css } from '../../../src/core/util.js';

export default {
  id: 'hatch',
  focus: 'center',

  render(ctx) {
    const { f, gl, lines, text, type, comp, W, H, P } = ctx;

    // 浅纸底
    gl.clear(ctx.out, [0.93, 0.89, 0.81]);

    lines.begin();
    // ① 从上到下的五档灰阶条：排线应该"越往下越密、方向越多"
    const bars = 5;
    const y0 = Math.round(H * 0.17);
    const bh = Math.round(H * 0.20);
    for (let i = 0; i < bars; i++) {
      const v = 0.94 - i * 0.20;                       // 0.94 → 0.14
      lines.fillRect(W * 0.06, y0 + i * bh, W * 0.36, bh - 4, [v, v, v], 3);
    }

    // ② 一块横向渐变（从白到黑）：连续调也能被排线读出来
    const gx = Math.round(W * 0.50);
    const gw = Math.round(W * 0.44);
    for (let i = 0; i < 220; i++) {
      const u = i / 219;
      const v = 0.95 * (1 - u);
      lines.seg(gx + u * gw, y0, gx + u * gw, y0 + bh * bars - 4, (gw / 220) * 1.6, [v, v, v]);
    }

    // ③ 一轮"太阳"：中间调的大面积圆
    lines.fillCircle(W * 0.5, H * 0.80, Math.round(H * 0.13), [0.42, 0.42, 0.42], 3);
    lines.fillCircle(W * 0.78, H * 0.80, Math.round(H * 0.07), [0.12, 0.12, 0.12], 3);
    lines.flush(ctx.out);

    // ⚠ **这个场景刻意没有文字**：排线是整帧成像（style.view），文字也会被刻成线 ——
    //   黑字在三档排线全上的区域里就是一片麻，读不出来（探针图实测）。
    //   真片子里要用字，就用**阳文**：先铺一块深色版、再用浅色写字
    //   （字形变成"版上的白"），或者让标题避开排线（见 docs/COOKBOOK.md §16.4）。
    return { bloom: 0.0, grain: 0.0, vignette: 0.0 };
  },
};