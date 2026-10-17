// zoom —— zoomThrough 的图册：对数推近，一张卡片充满画面 = 下一个场景。
//
// 「众多卡片之一是下一场景」：五张卡片，中间那张（420,360,480,270）在 t0 后
// 0.8s 内被推到充满画面；s/tx/ty 直接喂 setXform —— 全层一起推，与 transitionPass
// 的「甩走」互补（那 是旧内容的退场，这是新内容的入场）。
import { makeShot, withAlpha } from '../../../src/kit/index.js';
import { zoomThrough } from '../../../src/kit/carry.js';
import { css } from '../../../src/core/util.js';

export default makeShot('zoom', {
  draw(ctx, { enter }) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const z = zoomThrough(f.lt, 0.5, 0.8, [420, 360, 480, 270], 1920, 1080);
    // 全层推近：setXform 吃我们文档里的公式（x/y/scale）
    ctx.setXform({ x: z.tx, y: z.ty, scale: z.s });
    lines.begin();
    const cards = [
      [240, 180, 480, 270], [1200, 180, 480, 270],
      [420, 360, 480, 270],   // ← 推近目标
      [240, 660, 480, 270], [1200, 660, 480, 270],
    ];
    let idx = 0;
    for (const [x, y, w, h] of cards) {
      const isTarget = idx === 2;
      lines.rect(x, y, w, h, 2.5, withAlpha(isTarget ? P.signal : P.ash, 0.9));
      lines.fillRect(x + 14, y + 14, w - 28, h - 28,
        isTarget ? [P.signal[0], P.signal[1], P.signal[2], 0.14] : [P.ash[0], P.ash[1], P.ash[2], 0.06]);
      idx++;
    }
    lines.seg(420, 356, 900, 356, 1.5, withAlpha(P.bone, 0.8));
    lines.seg(420, 640, 900, 640, 1.5, withAlpha(P.bone, 0.8));
    lines.flush(ctx.out);

    text.clear();
    type.writeLine('zoomThrough', 96, 120, { anchor: 'left', size: 30, family: 'mono', color: css(P.ash), ...enter(0) });
    type.writeLine('推近穿透：中间那张卡就是下一场景', 96, 156, { anchor: 'left', size: 20, family: 'mono', color: css(P.ash), ...enter(0.1) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.12, grain: 0.02 };
  },
});
