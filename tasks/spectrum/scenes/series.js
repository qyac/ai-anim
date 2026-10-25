// @ts-check
/**
 * 第 2 段 `series` —— 一串圆，一个接一个转；圆越多，边越尖。
 *
 * 左：圆链（每一项一圈）；右：只取前 k 项的和画出来的波形。
 * k 随时间长，观众能直接看到"多几项 = 边更直"。
 */
import { css, sat } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';
import { L, ink, signal, muted, squareCoeffs, squareWave, chain, growK } from './_kit.js';

const C = squareCoeffs(40);   // 前 40 个奇次谐波

export default makeShot('series', {
  setup() { this.C = C; this.N = C.length; },
  draw(ctx) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const t = f.lt / (ctx.params?.stretch ?? 1);
    const k = Math.max(1, growK(t, 6.4, this.N));
    const kInt = Math.round(k);
    const yMid = 590;

    // ── 左：圆链（S 取小一点，首圈半径 = 4/π ≈ 1.27，×80 ≈ 102px）──
    const cx = 322, cy = yMid, S = 132;
    const { circles, x: tipX0, y: tipY0 } = chain(this.C, kInt, t * 1.6);

    lines.begin();
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      const fade = sat((k - i) * 0.9);
      if (fade <= 0) continue;
      const al = (0.5 - i * 0.013) * fade;
      if (al > 0.012) lines.circle(cx + c.x * S, cy + c.y * S, c.r * S, 1.1, muted(P, al), 32);
      lines.seg(cx + c.x * S, cy + c.y * S, cx + (c.x + c.r * Math.cos(c.n * t * 1.6)) * S, cy + (c.y + c.r * Math.sin(c.n * t * 1.6)) * S, 1.0, signal(P, 1, 0.24 * fade));
    }
    const tipX = cx + tipX0 * S, tipY = cy + tipY0 * S;
    lines.circle(tipX, tipY, 5, 2, signal(P, 1.9));

    // ── 右：波形 ──
    const wx0 = 660, wx1 = 1740;
    const wMidY = yMid, wAmp = 205;
    lines.seg(tipX, tipY, wx0 - 26, wMidY - squareWave(t * 1.6, kInt, this.C) * wAmp * 0.5, 1.0, signal(P, 1, 0.3));
    lines.seg(wx0, wMidY, wx1, wMidY, 1, muted(P, 0.26));

    const M = 1100;
    const pts = [];
    for (let i = 0; i <= M; i++) {
      const u = i / M;
      pts.push([wx0 + (wx1 - wx0) * u, wMidY - squareWave(u * 4 * Math.PI * 2, kInt, this.C) * wAmp]);
    }
    lines.polyline(pts, 3.0, ink(P, 1));
    // 理想方波参照：极淡的竖排短划
    for (let i = 0; i <= 120; i++) {
      const u = i / 120;
      const s = Math.sin(u * 4 * Math.PI * 2);
      const y = wMidY - Math.sign(s) * Math.min(1, Math.abs(s) * 40) * wAmp;
      const x = wx0 + (wx1 - wx0) * u;
      lines.seg(x, y - 5, x, y + 5, 1, muted(P, 0.20));
    }
    lines.flush(ctx.out);

    text.clear();
    const ent = (d) => ({ alpha: [0, 1], t, staggerDur: 0.5 });
    type.writeLine('SIGNAL / 02', L.x0, 128, { size: 24, family: 'mono', color: css(P.ash), ...ent(0) });
    type.writeLine('圆链', 200, 268, { size: 56, weight: 800, family: 'sans', color: css(P.bone), ...ent(0.2) });
    type.writeLine('前 k 项的和', wx0, 268, { size: 56, weight: 800, family: 'sans', color: css(P.bone), ...ent(0.3) });
    // 读数放右上角的页眉行（与波形同高会压线）
    type.writeLine('k', wx1 - 96, 128, { size: 24, family: 'mono', color: css(P.ash), align: 'right' });
    type.writeLine(String(kInt), wx1, 196, { size: 52, weight: 800, family: 'mono', color: css(P.signal), align: 'right' });
    type.writeLine('短划 = 理想方波', wx0, 940, { size: 24, family: 'mono', color: css(P.ash) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.18, grain: 0.022 };
  },
});
