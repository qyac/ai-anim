// @ts-check
/**
 * 第 5 段 `keep` —— 留下低频它变糊，只留高频只剩边。
 *
 * 同一张图，三种重建：只留低频（1/8 系数）/ 全留 / 只留高频。
 * 全部用真的二维 IDCT 算回来，不是滤镜 —— 所以"糊"和"只剩边"是变换本身的结论。
 */
import { css, sat, prog } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';
import { L, ink, signal, muted } from './_kit.js';

const N = 8;

function dct2(block) {
  const out = [];
  for (let u = 0; u < N; u++) for (let v = 0; v < N; v++) {
    let s = 0;
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
      s += block[x][y] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
    }
    const cu = u === 0 ? Math.SQRT1_2 : 1, cv = v === 0 ? Math.SQRT1_2 : 1;
    out.push({ u, v, c: 0.25 * cu * cv * s });
  }
  return out;
}

function idct2(coef) {
  const b = [];
  for (let x = 0; x < N; x++) {
    b.push([]);
    for (let y = 0; y < N; y++) {
      let s = 0;
      for (const { u, v, c } of coef) {
        const cu = u === 0 ? Math.SQRT1_2 : 1, cv = v === 0 ? Math.SQRT1_2 : 1;
        s += cu * cv * c * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
      }
      b[x].push(0.25 * s);
    }
  }
  return b;
}

/** 一张有细节的测试图：斜边 + 一条细线 + 一个角（低频与高频都有） */
function makeBlock() {
  const b = [];
  for (let x = 0; x < N; x++) {
    b.push([]);
    for (let y = 0; y < N; y++) {
      let v = (x + y > 7) ? 0.85 : 0.12;
      if (x === 3 && y >= 4) v = 0.95;          // 一条细竖线（高频）
      if (x <= 1 && y <= 1) v = 0.62;           // 左上角（低频）
      b[x].push(v);
    }
  }
  return b;
}

export default makeShot('keep', {
  setup() {
    const block = makeBlock();
    const coef = dct2(block);
    const lowCoef = coef.filter((c) => c.u <= 1 && c.v <= 1);          // 左上 4 个（最低频）
    const highCoef = coef.filter((c) => c.u >= 5 || c.v >= 5);          // 右下（高频）
    /**
     * 三个重建结果都按**自己的** min/max 拉伸到 0..1 再显示 —— 这一步必须说明：
     * 只留高频时重建出来的值域只有 ±0.3（高频没有"亮度"、只有"边缘"），
     * 不拉伸就只是一块几乎全黑的格子，什么都看不出来。
     * 拉伸只改变对比度，不改变形状；形状是变换算出来的。
     */
    const norm = (img) => {
      let lo = Infinity, hi = -Infinity;
      for (const row of img) for (const v of row) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const d = hi - lo || 1;
      return img.map((row) => row.map((v) => (v - lo) / d));
    };
    this.block = block;
    this.orig = norm(idct2(coef));
    this.low = norm(idct2(lowCoef));
    this.high = norm(idct2(highCoef));
  },
  draw(ctx) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const t = f.lt / (ctx.params?.stretch ?? 1);
    const cell = 40;
    const panels = [
      { key: 'orig', label: '全部 64 个系数', x: 220 },
      { key: 'low', label: '只留低频', x: 760 },
      { key: 'high', label: '只留高频', x: 1300 },
    ];
    const gy = 400;

    lines.begin();
    panels.forEach((p, pi) => {
      const appear = prog(t, 0.4 + pi * 1.5, 1.0 + pi * 1.5, 'outCubic');
      if (appear <= 0) return;
      const img = this[p.key];
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          const v = img[x][y];
          const a = Math.min(appear * 2, 1) * sat(appear * 64 - (x * 8 + y) * 0.5);
          if (a <= 0.01) continue;
          lines.fillRect(p.x + y * cell + 1, gy + x * cell + 1, cell - 2, cell - 2, [v, v, v, a * 0.95], 2);
        }
      }
      for (let i = 0; i <= N; i++) {
        lines.seg(p.x, gy + i * cell, p.x + N * cell, gy + i * cell, 1, muted(P, 0.35));
        lines.seg(p.x + i * cell, gy, p.x + i * cell, gy + N * cell, 1, muted(P, 0.35));
      }
    });
    lines.flush(ctx.out);

    text.clear();
    const ent = (d) => ({ alpha: [0, 1], t, staggerDur: 0.5 });
    type.writeLine('SIGNAL / 05', L.x0, 128, { size: 24, family: 'mono', color: css(P.ash), ...ent(0) });
    type.writeLine('留下哪些频率', 200, 268, { size: 56, weight: 800, family: 'sans', color: css(P.bone), ...ent(0.2) });
    panels.forEach((p, pi) => {
      if (t < 0.4 + pi * 1.5) return;
      type.writeLine(p.label, p.x, gy - 30, { size: 26, family: 'mono', color: pi === 1 ? css(P.signal) : css(P.ash) });
    });
    type.writeLine('同一张 8 × 8 图，只改保留的频率　·　每格已按自身亮度范围拉伸显示', L.x0, 985, { size: 21, family: 'mono', color: css(P.ash), ...ent(0.6) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.18, grain: 0.022 };
  },
});