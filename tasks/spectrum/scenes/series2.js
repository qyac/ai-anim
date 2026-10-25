// @ts-check
/**
 * 第 2b 段 `series2` —— 同一个波形的放大特写：边角上那几道振铃（吉布斯现象）。
 *
 * 它和 `series` 共用一段旁白（timeline 把一段 narration 切成两个视觉镜头），
 * 因为"圆越多边越尖"说完之后，眼睛需要再看一眼**边角到底怎么变的**。
 * 振铃是真的：有限项傅里叶级数在跳变处必然过冲约 9%，项数再多也不消失、只是变窄。
 */
import { css, sat, prog } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';
import { L, ink, signal, muted, squareCoeffs, squareWave } from './_kit.js';

const C = squareCoeffs(40);

export default makeShot('series2', {
  draw(ctx) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const t = f.lt / (ctx.params?.stretch ?? 1);
    const x0 = 300, x1 = 1720, yMid = 600;
    const amp = 190;

    // 只画一个跳变附近的窗口（约 0.35 个周期）
    const u0 = 0.235, u1 = 0.315;
    const k = Math.round(40);
    const k2 = 3;

    lines.begin();
    // 网格：几条水平参考线
    for (let i = -1; i <= 1; i++) {
      lines.seg(x0, yMid - i * amp, x1, yMid - i * amp, 1, muted(P, 0.16));
    }
    // 过冲参考线（±9%，吉布斯常数）
    const os = amp * 0.0895 * 2;
    lines.seg(x0, yMid - amp - os, x1, yMid - amp - os, 1.2, signal(P, 1, 0.35));
    lines.seg(x0, yMid + amp + os, x1, yMid + amp + os, 1.2, signal(P, 1, 0.35));

    // 三条不同项数的曲线叠在同一窗口上
    const curves = [
      { k: 3, a: 0.35, w: 1.6 },
      { k: 9, a: 0.55, w: 1.8 },
      { k: 40, a: 1.0, w: 2.8 },
    ];
    const reveal = prog(t, 0.3, 3.6, 'outCubic');
    curves.forEach((c, ci) => {
      const a = sat(reveal * 3 - ci * 0.9);
      if (a <= 0) return;
      const pts = [];
      for (let i = 0; i <= 400; i++) {
        const u = u0 + (u1 - u0) * (i / 400);
        pts.push([x0 + (x1 - x0) * (i / 400), yMid - squareWave(u * 4 * Math.PI * 2, c.k, C) * amp]);
      }
      lines.polyline(pts, c.w, ci === 2 ? ink(P, a) : signal(P, 1, c.a * a));
    });
    lines.flush(ctx.out);

    text.clear();
    const ent = (d) => ({ alpha: [0, 1], t, staggerDur: 0.5 });
    type.writeLine('SIGNAL / 02b', L.x0, 128, { size: 24, family: 'mono', color: css(P.ash), ...ent(0) });
    type.writeLine('边角放大', 200, 268, { size: 56, weight: 800, family: 'sans', color: css(P.bone), ...ent(0.2) });
    if (reveal > 0.5) {
      type.writeLine('k = 3', 980, 985, { size: 24, family: 'mono', color: css(P.signal), alpha: sat((reveal - 0.5) * 3) });
      type.writeLine('k = 9', 1090, 985, { size: 24, family: 'mono', color: css(P.signal), alpha: sat((reveal - 0.65) * 3) });
      type.writeLine('k = 40', 1200, 985, { size: 24, family: 'mono', color: css(P.bone), alpha: sat((reveal - 0.8) * 3) });
    }
    type.writeLine('红线 = ±9% 过冲（吉布斯）', L.x0, 985, { size: 21, family: 'mono', color: css(P.ash), ...ent(0.6) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.18, grain: 0.022 };
  },
});