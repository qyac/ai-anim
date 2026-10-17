// morph —— morphRect 的图册：一个容器自己的形变（卡片 → 窗口）。
//
// 「按下的东西变成结果」的骨架：t0 时刻起、0.9s 内从 A（一张小卡片）长成 B（一个窗口），
// 同一层只改几何 —— 这正是 probe 教训（REFERENCE-onetake.md §2.3①）的正面写法：
// carry 要做成一个元素自己的形变，量具和眼睛才能对上。
import { makeShot, withAlpha } from '../../../src/kit/index.js';
import { morphRect } from '../../../src/kit/carry.js';
import { css } from '../../../src/core/util.js';

export default makeShot('morph', {
  draw(ctx, { enter }) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const m = morphRect(f.lt, 0.3, 0.9, [300, 620, 340, 90], [560, 200, 800, 620]);
    lines.begin();
    // 容器本体：描边 + 半透明填充（同一层，几何全部来自 morphRect）
    lines.rect(m.x, m.y, m.w, m.h, 2.5, withAlpha(P.bone, 0.9));
    lines.fillRect(m.x, m.y, m.w, m.h, [P.signal[0], P.signal[1], P.signal[2], 0.10]);
    // 窗口出现后的内容：两条分栏线，透明度跟着形变进度
    if (m.k > 0.6) {
      const a = (m.k - 0.6) / 0.4;
      lines.rect(m.x + m.w * 0.55, m.y + 14, m.w * 0.38, m.h - 28, 1.5, withAlpha(P.ash, 0.5 * a));
      lines.seg(m.x + 16, m.y + 64, m.x + m.w - 16, m.y + 64, 1.5, [P.ash[0], P.ash[1], P.ash[2], 0.6 * a]);
    }
    lines.flush(ctx.out);

    text.clear();
    type.writeLine('morphRect', 96, 120, { anchor: 'left', size: 30, family: 'mono', color: css(P.ash), ...enter(0) });
    type.writeLine('卡片 → 窗口：一层只改几何', 96, 156, { anchor: 'left', size: 20, family: 'mono', color: css(P.ash), ...enter(0.1) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.12, grain: 0.02 };
  },
});
