// gather —— 收拢的图册：12 个元素沿扇形弧收拢成一簇。
//
// 「许多变成一组」：12 个点各从自己的位置出发、错峰 0.05s、沿扇形弧
// （bow = chord×0.35×sin(πk)）收向簇心；行程抖动乘同一个 sin(πk) 窗，
// 端点精确落在簇心 ± spread 内 —— 收拢收得齐，这是第一版踩过又修掉的坑
//（tools/test-carry.mjs「spread 的散布有界」钉着它）。
import { makeShot, withAlpha } from '../../../src/kit/index.js';
import { gather } from '../../../src/kit/carry.js';
import { rng, css } from '../../../src/core/util.js';

export default makeShot('gather', {
  setup(ctx) {
    // 12 个出发点：沿画面四周一圈（rng 预计算，铁律：不用 Math.random）
    const r = rng(7);
    this.cast = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 + r() * 0.4;
      const rad = 560 + r() * 160;
      return [960 + Math.cos(a) * rad, 540 + Math.sin(a) * rad * 0.7];
    });
  },
  draw(ctx, { enter }) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const to = [960, 540];
    lines.begin();
    for (let i = 0; i < this.cast.length; i++) {
      const g = gather(f.lt, 0.3, 1.4, i, this.cast.length, this.cast[i], to,
        { spread: 46, stagger: 0.05, seed: 7 });
      const size = 12 + (i % 4) * 4;
      lines.circle(g.x, g.y, Math.max(1, size), 2.2, withAlpha(i % 3 === 0 ? P.signal : P.bone, 0.9));
    }
    // 簇心刻度环
    lines.circle(to[0], to[1], 60, 1.2, withAlpha(P.ash, 0.4));
    lines.flush(ctx.out);

    text.clear();
    type.writeLine('gather', 96, 120, { anchor: 'left', size: 30, family: 'mono', color: css(P.ash), ...enter(0) });
    type.writeLine('12 → 1：扇形弧收拢 · 抖动在端点归零', 96, 156, { anchor: 'left', size: 20, family: 'mono', color: css(P.ash), ...enter(0.1) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.12, grain: 0.02 };
  },
});
