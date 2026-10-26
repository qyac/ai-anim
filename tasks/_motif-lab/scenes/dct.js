// @ts-check
/**
 * 母题夹具 ②：8×8 块的 DCT / 有损重建（BACKLOG 1-49 的 `dct` 母题）。
 *
 * 三块并排：原件 / 只留左上 4 个低频 / 只留右下高频。全部**真的**算出来 ——
 * 所以"糊"和"只剩边"是变换的结论，不是滤镜。
 */
import { css, prog } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';
import { dct2, idct2, normalizeBlock, DCT_BLOCK } from '../../../src/kit/index.js';

const N = DCT_BLOCK;

/** 一张有细节的测试图：阶梯 + 一条细竖线 + 一个角（低频与高频都有） */
function makeBlock() {
  const b = [];
  for (let x = 0; x < N; x++) {
    const row = [];
    for (let y = 0; y < N; y++) {
      let v = x + y > 7 ? 0.85 : 0.12;
      if (x === 3 && y >= 4) v = 0.95;
      if (x <= 1 && y <= 1) v = 0.62;
      row.push(v);
    }
    b.push(row);
  }
  return b;
}

export default makeShot('dct', {
  setup() {
    const block = makeBlock();
    const coef = dct2(block);
    this.views = [
      { label: '原件', img: block },
      { label: '只留低频', img: normalizeBlock(idct2(coef.filter((c) => c.u <= 1 && c.v <= 1))) },
      { label: '只留高频', img: normalizeBlock(idct2(coef.filter((c) => c.u >= 5 || c.v >= 5))) },
    ];
  },

  draw(ctx) {
    const { f, gl, P, lines, text, type, comp } = ctx;
    const g = ctx.grid;
    const T = ctx.style.tokens;
    const t = f.lt;

    gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);

    const cell = 46;
    const gapX = 120;
    const totalW = this.views.length * N * cell + (this.views.length - 1) * gapX;
    const startX = Math.round((ctx.W - totalW) / 2);
    const topY = 420;

    lines.begin();
    this.views.forEach((view, vi) => {
      const k = Math.min(1, Math.max(0, (t - 0.15 * vi) / 0.5));
      const bx = startX + vi * (N * cell + gapX);
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          const v = Math.min(1, Math.max(0, view.img[x][y])) * k;
          // 线性色：骨白 v，信号色给最后一列一点提示
          const c = vi === 2
            ? [P.signal[0] * v, P.signal[1] * v, P.signal[2] * v, 1]
            : [P.bone[0] * v, P.bone[1] * v, P.bone[2] * v, 1];
          lines.fillRect(bx + y * cell, topY + x * cell, cell - 2, cell - 2, c);
        }
      }
    });
    lines.flush(ctx.out);

    text.clear();
    type.write('丢掉 60 / 64 个系数', g.pad, g.top + 10, {
      size: 'h1', weight: T.weight.h1, family: 'sans', color: css(P.bone),
      alpha: [0, Math.min(1, t / 0.5)], t,
    });
    this.views.forEach((view, vi) => {
      const bx = startX + vi * (N * cell + gapX);
      type.write(view.label, bx, topY - 24, {
        size: 'label', weight: T.weight.label, family: 'mono', color: css(P.ash),
        alpha: [0, prog(t, 0.1 + vi * 0.15, 0.5)], t,
      });
    });
    type.write('8×8 二维 DCT · 真的变换，不是滤镜', g.pad, g.footerY, {
      size: 'mono', weight: T.weight.label, family: 'mono', color: css(P.ash),
      alpha: [0, Math.min(1, t / 0.8)], t,
    });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });

    return { bloom: T.texture.bloom, grain: T.texture.grain, vignette: T.texture.vignette, ca: T.texture.ca };
  },
});
