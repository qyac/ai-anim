// @ts-check
/**
 * 竖屏夹具 · 第一段（BACKLOG 1-52）：标题层级 + 线宽三档。
 *
 * 这一段的坐标**全部从 `ctx.grid` 取**（pad / top / contentBottom），字号**全部写语义名字** ——
 * 于是它同时是两件事的样本：
 *   ① 竖屏栅格（1080×1920 那一套，按短边换算）；
 *   ② 语义字号（`size: 'hero'`）在竖屏下自动 ×1.35（`PORTRAIT_TYPE_SCALE`）。
 * 横屏跑同一份场景（`--style` 不变、只改画幅）时，两者都会回到横屏的取值 —— 这就是回归口径。
 */
import { css, spring } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';

export default makeShot('hero', {

  draw(ctx) {
    const { f, gl, P, lines, text, type, comp } = ctx;
    const g = ctx.grid;
    const T = ctx.style.tokens;
    const t = f.lt;

    gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);

    const e = spring(t - 0.15);
    const alpha = (k) => [0, Math.min(1, Math.max(0, k))];

    lines.begin();
    // 一条主笔（rule.hero × 竖屏系数）在标题下面划一道
    lines.seg(g.pad, g.top + 300, g.pad + 240, g.top + 300, T.rule.hero, P.signal);
    // 一条发丝线，页脚位置
    lines.seg(g.pad, g.footerLineY, ctx.W - g.pad, g.footerLineY, T.rule.hair, [P.ash[0], P.ash[1], P.ash[2], 0.4]);
    lines.flush(ctx.out);

    text.clear();
    type.write('PORTRAIT · 1080×1920', g.pad, g.top, {
      size: 'label', weight: T.weight.label, family: 'mono', color: css(P.ash),
      alpha: alpha(e), t: t - 0.10, stagger: T.motion.stagger,
    });
    // 一屏只有一个 hero
    type.write('竖屏的字', g.pad, g.top + 190, {
      size: 'hero', weight: T.weight.hero, family: 'sans', color: css(P.bone),
      alpha: alpha(e), t: t - 0.18, stagger: T.motion.stagger,
    });
    type.write('要比横屏大一号', g.pad, g.top + 400, {
      size: 'h2', weight: T.weight.h2, family: 'sans', color: css(P.ash),
      alpha: alpha(e), t: t - 0.28, stagger: T.motion.stagger,
    });
    type.write('1.35× · 短边 1080', g.pad, g.footerY, {
      size: 'label', weight: T.weight.label, family: 'mono', color: css(P.ash),
      alpha: alpha(e), t: t - 0.36,
    });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });

    return { bloom: T.texture.bloom, grain: T.texture.grain, vignette: T.texture.vignette, ca: T.texture.ca };
  },
});
