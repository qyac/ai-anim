// @ts-check
/**
 * 填充面夹具（src/core/fill.js 的标定卡）。
 *
 * 六种「面」，全部由 `lines.fillPoly / fillCircle / fillSector` 画出来 ——
 * 在这之前引擎只能用 `fillRect`（一行行矩形）表达面，圆和山体都只能靠描边逼近。
 *
 * 这一屏同时是**回归的视觉锚点**：形状不对（洞没挖出来、扇区角反了、非零环绕搞反）
 * 一眼就看得出来。
 */

import { css, prog, noise1 } from '../../../src/core/util.js';

export default {
  id: 'fill-lab',
  focus: 'center',
  render(ctx) {
    const { f, gl, P, lines, text, type, comp, W, H } = ctx;
    const t = f.lt;

    const PAPER = 0.60;
    gl.clear(ctx.out, [P.bone[0] * PAPER, P.bone[1] * PAPER, P.bone[2] * PAPER]);

    const ink = [P.ink[0], P.ink[1], P.ink[2], 1];
    const sig = [P.signal[0], P.signal[1], P.signal[2], 1];
    const ash = [P.ink[0] * 0.45, P.ink[1] * 0.45, P.ink[2] * 0.45, 1];

    lines.begin();

    // ① 圆盘：同心实心圆（以前只能描边）
    lines.fillCircle(W * 0.14, H * 0.34, 96, ink);
    lines.fillCircle(W * 0.14, H * 0.34, 62, [P.bone[0] * PAPER, P.bone[1] * PAPER, P.bone[2] * PAPER, 1]);
    lines.fillCircle(W * 0.14, H * 0.34, 30, sig);

    // ② 山体：起伏的多边形（顶点是 t 的函数）
    const ridge = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const x = W * 0.30 + W * 0.16 * u;
      const y = H * 0.42 - H * 0.10 * (0.5 + 0.5 * Math.sin(u * 7.0 + t * 0.6)) - H * 0.03 * noise1(u * 5 + t * 0.2);
      ridge.push([x, y]);
    }
    ridge.push([W * 0.46, H * 0.52]);
    ridge.push([W * 0.30, H * 0.52]);
    lines.fillPoly(ridge, ash);

    // ③ 带洞：矩形环（偶奇规则，内环自动挖掉）
    const cx = W * 0.58, cy = H * 0.34, s = 92;
    const hole = s * (0.30 + 0.12 * Math.sin(t * 1.6));
    lines.fillPoly([
      [[cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s]],
      [[cx - hole, cy - hole], [cx + hole, cy - hole], [cx + hole, cy + hole], [cx - hole, cy + hole]],
    ], sig);

    // ④ 扇环：进度环（r0 > 0）
    const pcx = W * 0.76, pcy = H * 0.34;
    lines.fillSector(pcx, pcy, 58, 86, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.72, ink);
    lines.fillSector(pcx, pcy, 0, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.35, ash);

    // ⑤ 扇形拼成的饼图（四个扇区、两条被挖空一点）
    const dcx = W * 0.14, dcy = H * 0.70, dr = 88;
    const slices = [[0, 0.30], [0.34, 0.58], [0.62, 0.86], [0.90, 1.0]];
    slices.forEach(([a, b], i) => {
      const a0 = -Math.PI / 2 + Math.PI * 2 * a;
      const a1 = -Math.PI / 2 + Math.PI * 2 * b;
      lines.fillSector(dcx, dcy, i === 1 ? 34 : 0, dr, a0, a1, i === 1 ? sig : i % 2 ? ash : ink);
    });

    // ⑥ 一条飘带：窄长多边形，检验细长形状不会漏行
    const ribbon = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const x = W * 0.30 + W * 0.62 * u;
      const y = H * 0.70 + H * 0.10 * Math.sin(u * 6.2 - t * 0.9);
      ribbon.push([x, y - 14]);
    }
    for (let i = 40; i >= 0; i--) {
      const u = i / 40;
      const x = W * 0.30 + W * 0.62 * u;
      const y = H * 0.70 + H * 0.10 * Math.sin(u * 6.2 - t * 0.9);
      ribbon.push([x, y + 14]);
    }
    lines.fillPoly(ribbon, [P.signal[0] * 0.55, P.signal[1] * 0.55, P.signal[2] * 0.55, 1]);

    lines.flush(ctx.out);

    text.clear();
    type.write('面：六种填法', W * 0.10, H * 0.14, {
      size: 'h1', weight: 800, family: 'sans', color: css(P.ink), t: t * 0.9,
    });
    type.writeLine('fillCircle · fillPoly · 偶奇带洞 · fillSector · 扇环 · 飘带', W * 0.10, H * 0.92, {
      anchor: 'left', size: 24, weight: 500, family: 'mono', color: css(P.ink), alpha: 0.8,
    });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });

    return { bloom: 0.10, grain: 0.012, vignette: 0.22 };
  },
};