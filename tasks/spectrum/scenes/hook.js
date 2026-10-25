// @ts-check
/**
 * 第 1 段 `hook` —— 一个方波，问"它由什么组成"。
 *
 * 版面分三层（paper 风格的栅格）：标题在左上，波形占中间一条带，标注在右下。
 * 波形是从左往右真按方波公式画出来的，不是贴图。
 */
import { css, prog, sat } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';
import { L, ink, signal, muted } from './_kit.js';

/** 理想方波：sign(sin(t))，过零处一点点平滑（否则抗锯齿会抖） */
function square(t) {
  const s = Math.sin(t);
  return Math.sign(s) * Math.min(1, Math.abs(s) * 40);
}

export default makeShot('hook', {
  draw(ctx) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const t = f.lt / (ctx.params?.stretch ?? 1);
    const yMid = 610;            // 波形中线：压在标题之下，给标注留出下方
    const amp = 118;
    const x0 = L.x0, x1 = L.x1;

    const grow = prog(t, 0.25, 3.6, 'outCubic');
    const xHead = x0 + (x1 - x0) * grow;

    lines.begin();
    lines.seg(x0, yMid, x1, yMid, 1, muted(P, 0.30));

    const N = 960;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const x = x0 + (x1 - x0) * u;
      if (x > xHead) break;
      pts.push([x, yMid - square(u * 4 * Math.PI * 2) * amp]);
    }
    lines.polyline(pts, 3.4, ink(P, 1));

    // 生长中的游标（只在还在长的时候出现）
    if (grow < 0.999) {
      const cur = pts[pts.length - 1];
      if (cur) {
        lines.seg(cur[0], yMid - amp * 1.45, cur[0], yMid + amp * 1.45, 1.2, signal(P, 1, 0.5));
        lines.circle(cur[0], cur[1], 6, 2.2, signal(P, 1.8));
      }
    }

    // 第 2 句起：三个分解点亮起（后面几段从这里长出来）
    const mark = prog(t, 3.2, 5.4, 'outCubic');
    if (mark > 0) {
      [0.18, 0.46, 0.78].forEach((u, i) => {
        const x = x0 + (x1 - x0) * u;
        const y = yMid - square(u * 4 * Math.PI * 2) * amp;
        const a = sat(mark * 3 - i * 0.55);
        if (a <= 0) return;
        lines.circle(x, y, 15 + 9 * a, 1.5, signal(P, 1, 0.7 * a), 40);
        lines.circle(x, y, (15 + 9 * a) * 2.0, 1.0, signal(P, 1, 0.24 * a), 48);
        lines.seg(x, y + amp * 1.5, x, y + amp * 1.5 + 34 * a, 1.3, signal(P, 1, 0.55 * a));
      });
    }
    lines.flush(ctx.out);

    text.clear();
    const ent = (d) => ({ alpha: [0, 1], t, staggerDur: 0.5 });
    type.writeLine('SIGNAL / 01', L.x0, 128, { size: 24, family: 'mono', color: css(P.ash), ...ent(0) });
    type.writeLine('方波', L.x0, 268, { size: 96, weight: 800, family: 'sans', color: css(P.bone), ...ent(0.2) });
    type.writeLine('square wave', L.x0 + 236, 268, { size: 30, family: 'mono', color: css(P.ash), ...ent(0.35) });
    if (mark > 0.35) {
      type.writeLine('三次分解', L.x1, 940, { size: 28, family: 'mono', color: css(P.signal), align: 'right', alpha: sat((mark - 0.35) * 2.4) });
    }
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.20, grain: 0.022 };
  },
});
