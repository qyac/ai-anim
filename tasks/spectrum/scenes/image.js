// @ts-check
/**
 * 第 4 段 `image` —— 图像也一样：切成小块，每块拆成频率。
 *
 * 画面：左边一张 8×8 的格子（每格 = 一块），右边那一格的 DCT 系数按频率铺开。
 * DCT 是真的算出来的（JPEG 用的就是 8×8 二维 DCT-II），不是画的示意图。
 */
import { css, sat, prog } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';
import { L, ink, signal, muted } from './_kit.js';

/** 二维 DCT-II（8×8）：和 JPEG 用的是同一个变换 */
function dct2(block) {
  const N = 8, out = [];
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let s = 0;
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          s += block[x][y] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
        }
      }
      const cu = u === 0 ? Math.SQRT1_2 : 1, cv = v === 0 ? Math.SQRT1_2 : 1;
      out.push({ u, v, c: 0.25 * cu * cv * s });
    }
  }
  return out;
}

/** 一块真实的测试块：左上亮、右下暗，中间一条斜边（这样各频率都有内容） */
function makeBlock() {
  const b = [];
  for (let x = 0; x < 8; x++) {
    b.push([]);
    for (let y = 0; y < 8; y++) {
      const d = (x + y) / 14;                   // 斜向渐变
      const edge = x + y > 7 ? 0.85 : 0.15;     // 一条硬边（高频的来源）
      b[x].push(0.35 * (1 - d) + 0.65 * edge);
    }
  }
  return b;
}

export default makeShot('image', {
  setup() {
    this.block = makeBlock();
    this.coef = dct2(this.block);
    let mx = 0;
    for (const c of this.coef) mx = Math.max(mx, Math.abs(c.c));
    this.maxC = mx || 1;
  },
  draw(ctx) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const t = f.lt / (ctx.params?.stretch ?? 1);
    const gx = 260, gy = 330, cell = 62;

    lines.begin();
    // ── 左：8×8 的块（亮度 = 值）──
    const reveal = prog(t, 0.2, 2.0, 'outCubic');
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const a = sat(reveal * 64 - (x * 8 + y) * 0.8);
        if (a <= 0) continue;
        const v = this.block[x][y];
        const px = gx + y * cell, py = gy + x * cell;
        lines.fillRect(px + 1, py + 1, cell - 2, cell - 2, [v, v, v, a * 0.92], 2);
      }
    }
    // 网格线
    for (let i = 0; i <= 8; i++) {
      lines.seg(gx, gy + i * cell, gx + 8 * cell, gy + i * cell, 1, muted(P, 0.35));
      lines.seg(gx + i * cell, gy, gx + i * cell, gy + 8 * cell, 1, muted(P, 0.35));
    }

    // ── 右：DCT 系数（8×8 频率图，左上 = 低频）──
    const dx0 = 980, dy0 = 330, dc = 62;
    const show = prog(t, 2.0, 4.6, 'outCubic');
    this.coef.forEach((c, i) => {
      const a = sat(show * 64 - i * 0.7);
      if (a <= 0) return;
      const px = dx0 + c.v * dc, py = dy0 + c.u * dc;
      const m = Math.abs(c.c) / this.maxC;
      if (m > 0.02) {
        const col = c.c >= 0 ? signal(P, 1, a * (0.25 + m * 0.75)) : [P.ink[0], P.ink[1], P.ink[2], a * (0.2 + m * 0.6)];
        const s = Math.sqrt(m) * (dc - 18);
        lines.fillRect(px + 9 - s / 2 + (dc - 18) / 2, py + 9 - s / 2 + (dc - 18) / 2, s, s, col, 2);
      }
    });
    for (let i = 0; i <= 8; i++) {
      lines.seg(dx0, dy0 + i * dc, dx0 + 8 * dc, dy0 + i * dc, 1, muted(P, 0.3));
      lines.seg(dx0 + i * dc, dy0, dx0 + i * dc, dy0 + 8 * dc, 1, muted(P, 0.3));
    }

    // 一条从块到频率图的引线
    if (show > 0.1) {
      const a = sat((show - 0.1) * 3);
      lines.seg(gx + 8 * cell + 24, gy + 4 * cell, dx0 - 30, dy0 + 4 * dc, 1.4, signal(P, 1, 0.45 * a));
    }
    lines.flush(ctx.out);

    text.clear();
    const ent = (d) => ({ alpha: [0, 1], t, staggerDur: 0.5 });
    type.writeLine('SIGNAL / 04', L.x0, 128, { size: 24, family: 'mono', color: css(P.ash), ...ent(0) });
    type.writeLine('图像', 200, 268, { size: 56, weight: 800, family: 'sans', color: css(P.bone), ...ent(0.2) });
    if (reveal > 0.4) {
      type.writeLine('8 × 8 像素块', gx, gy - 34, { size: 26, family: 'mono', color: css(P.ash) });
    }
    if (show > 0.3) {
      type.writeLine('它的 64 个频率系数', dx0, dy0 - 34, { size: 26, family: 'mono', color: css(P.ash) });
      type.writeLine('左上 = 低频', dx0, dy0 + 8 * dc + 40, { size: 22, family: 'mono', color: css(P.ash) });
      type.writeLine('右下 = 高频', dx0 + 8 * dc, dy0 + 8 * dc + 40, { size: 22, family: 'mono', color: css(P.ash), align: 'right' });
    }
    type.writeLine('JPEG 用的就是这个变换', L.x0, 985, { size: 21, family: 'mono', color: css(P.ash), ...ent(0.6) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.18, grain: 0.022 };
  },
});
