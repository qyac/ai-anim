// @ts-check
/**
 * 母题夹具 ①：傅里叶拆方波（BACKLOG 1-49 的 `fourier` 母题）。
 *
 * 左边一串圆（本轮），右边同一条级数画成的波形 —— 两者由**同一个** `epicycles()/squareWave()`
 * 驱动，所以"圆转一圈、笔尖在右边画一笔"这件事在数学上是同源的。
 */
import { css, spring, prog } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';
import { squareCoeffs, growK, epicycles, drawEpicycles, wavePoints, drawWave, drawTicks, playheadX } from '../../../src/kit/index.js';

const C = squareCoeffs(8);
const TAU = Math.PI * 2;

export default makeShot('fourier', {
  draw(ctx) {
    const { f, gl, P, lines, text, type, comp } = ctx;
    const g = ctx.grid;
    const T = ctx.style.tokens;
    const t = f.lt;

    gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);

    const ink = [P.bone[0], P.bone[1], P.bone[2], 1];
    const dim = [P.bone[0], P.bone[1], P.bone[2], 0.55];
    const sig = [P.signal[0], P.signal[1], P.signal[2], 1];

    const k = growK(t, 2.2, C.length);
    const phase = t * 1.1;
    const e = epicycles(C, k, phase);

    // 左：本轮（圆心在画幅左侧三分之一，半径按像素放大）
    drawEpicycles(lines, e.circles, {
      cx: 520, cy: 560, scale: 190, width: 2, color: dim, accent: sig, pen: dim, lastN: 1, target: ctx.out,
    });

    // 右：同一条级数 → 波形（相位区间取 phase 前一个周期，游标停在"当前相位"对应的位置）
    const x0 = 900;
    const x1 = ctx.W - g.pad;
    const pts = wavePoints({
      x0, x1, yMid: 560, amp: 150, samples: 640,
      fn: (tau) => {
        let y = 0;
        for (let i = 0; i < k && i < C.length; i++) y += C[i].r * Math.sin(C[i].n * (tau + phase - Math.PI));
        return y;
      },
      clamp: true,
    });
    drawWave(lines, pts, { width: 3, color: ink });
    drawTicks(lines, { x0, x1, y: 560, step: 74, len: 7, color: dim });
    lines.flush(ctx.out);

    // 游标：把"笔尖当前的值"连到右边波形上
    const px = playheadX(x0, x1, 0.5);
    lines.begin();
    lines.seg(px, 560 - 190, px, 560 + 190, 1.5, [P.signal[0], P.signal[1], P.signal[2], 0.8]);
    const tipY = 560 - e.y * 150;
    lines.seg(520 + e.x * 190, 560 - e.y * 190, px, tipY, 1, [P.signal[0], P.signal[1], P.signal[2], 0.35]);
    lines.flush(ctx.out);

    text.clear();
    type.write('方波 = 一串圆', g.pad, g.top + 10, {
      size: 'h1', weight: T.weight.h1, family: 'sans', color: css(P.bone),
      alpha: [0, Math.min(1, t / 0.5)], t,
    });
    type.write(`前 ${Math.round(k)} 项`, g.pad, g.top + 96, {
      size: 'label', weight: T.weight.label, family: 'mono', color: css(P.ash),
      alpha: [0, prog(t, 0.2, 0.5)], t,
    });
    type.write('y = Σ sin(nx) / n', ctx.W - g.pad, g.footerY, {
      size: 'label', weight: T.weight.label, family: 'mono', color: css(P.ash), align: 'right',
      alpha: [0, Math.min(1, t / 0.7)], t,
    });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });

    return { bloom: T.texture.bloom, grain: T.texture.grain, vignette: T.texture.vignette, ca: T.texture.ca };
  },
});
