// @ts-check
/**
 * 竖屏夹具 · 第二段（BACKLOG 1-52）：图形主体 + 标注，验证
 * ① 竖屏的 `contentBottom`（正文不许越过字幕带上沿）；
 * ② 版面守门在竖屏下的读数（一屏几块、主体区几块）；
 * ③ **标注合并成一行**（`docs/LAYOUT.md` §1）：三个数分开写就是三个"看的地方"，
 *    合并成一行就只是一块 —— 竖屏更窄，这条纪律比横屏更要紧。
 */
import { css, spring, prog } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';

const VALUES = [0.34, 0.62, 0.88];

export default makeShot('bars', {
  draw(ctx) {
    const { f, gl, P, lines, text, type, comp } = ctx;
    const g = ctx.grid;
    const T = ctx.style.tokens;
    const t = f.lt;

    gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);

    const top = g.top + 220;
    const bottom = g.contentBottom;
    const x0 = g.pad;
    const w = ctx.W - g.pad * 2;
    const gap = 24;
    const bw = (w - gap * (VALUES.length - 1)) / VALUES.length;

    lines.begin();
    // 基线
    lines.seg(x0, bottom, x0 + w, bottom, T.rule.body, [P.ash[0], P.ash[1], P.ash[2], 0.5]);
    VALUES.forEach((v, i) => {
      const k = spring(t - 0.12 - i * 0.08);
      const h = (bottom - top) * v * k;
      const bx = x0 + i * (bw + gap);
      lines.fillRect(bx, bottom - h, bw, h, i === VALUES.length - 1
        ? [P.signal[0], P.signal[1], P.signal[2], 0.92]
        : [P.graphite[0], P.graphite[1], P.graphite[2], 0.9]);
    });
    lines.flush(ctx.out);

    text.clear();
    type.write('三根柱子，一个主体', x0, g.top, {
      size: 'h2', weight: T.weight.h2, family: 'sans', color: css(P.bone),
      alpha: [0, Math.min(1, t / 0.4)], t,
    });
    // 三个数**一行**：判据数的是"看的地方"，一行只是一块
    type.write('n=1  34    n=2  62    n=3  88', x0, g.top + 96, {
      size: 'label', weight: T.weight.label, family: 'mono', color: css(P.ash),
      alpha: [0, prog(t, 0.24, 0.6)], t,
    });
    type.write('示意读数 · 非真实数据', x0, g.footerY, {
      size: 'mono', weight: T.weight.label, family: 'mono', color: css(P.ash),
      alpha: [0, Math.min(1, t / 0.6)], t,
    });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });

    return { bloom: T.texture.bloom, grain: T.texture.grain, vignette: T.texture.vignette, ca: T.texture.ca };
  },
});
