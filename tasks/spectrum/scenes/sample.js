// @ts-check
/**
 * 第 6 段 `sample` —— 采样太少，会听见不存在的音（混叠 / aliasing）。
 *
 * 同一个高频正弦，用三种采样率去"采"它，再用直线连起来：
 * 采样够密（> 2 倍频率）→ 还原出原来的快振；
 * 采样太稀 → 连出来的是一条**慢**的假波。那条假波就是混叠。
 *
 * 这不是示意动画：采样点位置、连出来的折线，都是按采样定理真算的。
 */
import { css, sat, prog } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';
import { L, ink, signal, muted } from './_kit.js';

/** 被测信号：1 Hz 的纯正弦（周期 = 整屏宽度的 1/3） */
const F = 1.0;

export default makeShot('sample', {
  draw(ctx) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const t = f.lt / (ctx.params?.stretch ?? 1);
    const x0 = L.x0, x1 = L.x1;
    const yMid = 620, amp = 110;
    const span = 3.0;                   // 画 3 个周期

    const cases = [
      { hz: 16, label: '16 次/周期', ok: true },
      { hz: 2.4, label: '2.4 次/周期', ok: false },
      { hz: 1.3, label: '1.3 次/周期', ok: false },
    ];

    lines.begin();
    cases.forEach((c, ci) => {
      const appear = prog(t, 0.5 + ci * 2.0, 1.2 + ci * 2.0, 'outCubic');
      if (appear <= 0) return;
      const off = (ci - 1) * 0;          // 三组叠在同一坐标上，靠颜色与标签区分
      // 连续信号（很淡）
      const pts = [];
      for (let i = 0; i <= 600; i++) {
        const u = i / 600;
        pts.push([x0 + (x1 - x0) * u, yMid - Math.sin(u * span * Math.PI * 2 * F) * amp]);
      }
      lines.polyline(pts, 1.4, muted(P, 0.18 * appear));
    });
    lines.flush(ctx.out);

    // 三组各自一行（避免重叠）—— 上面那批只画连续信号，这里画采样
    lines.begin();
    cases.forEach((c, ci) => {
      const appear = prog(t, 0.5 + ci * 2.0, 1.2 + ci * 2.0, 'outCubic');
      if (appear <= 0) return;
      const yc = 340 + ci * 250;
      const A = 78;
      // 采样点
      const nSamp = Math.max(2, Math.round(c.hz * span));
      const samples = [];
      for (let i = 0; i <= nSamp; i++) {
        const u = i / nSamp;
        samples.push([x0 + (x1 - x0) * u, yc - Math.sin(u * span * Math.PI * 2 * F) * A]);
      }
      // 真实信号
      const cont = [];
      for (let i = 0; i <= 600; i++) {
        const u = i / 600;
        cont.push([x0 + (x1 - x0) * u, yc - Math.sin(u * span * Math.PI * 2 * F) * A]);
      }
      lines.polyline(cont, 1.2, muted(P, 0.22 * appear));
      // 采样点连线 —— 这条就是重建出来的信号
      const shown = Math.min(samples.length, Math.ceil(appear * samples.length));
      if (shown >= 2) {
        lines.polyline(samples.slice(0, shown), 2.6, c.ok ? [P.ink[0], P.ink[1], P.ink[2], appear] : signal(P, 1, appear));
      }
      for (let i = 0; i < shown; i++) {
        lines.circle(samples[i][0], samples[i][1], 4.5, 1.6, signal(P, c.ok ? 1 : 1.9, appear));
      }
      lines.seg(x0, yc, x1, yc, 0.8, muted(P, 0.16));
    });
    lines.flush(ctx.out);

    text.clear();
    const ent = (d) => ({ alpha: [0, 1], t, staggerDur: 0.5 });
    type.writeLine('SIGNAL / 06', L.x0, 128, { size: 24, family: 'mono', color: css(P.ash), ...ent(0) });
    type.writeLine('采样太少', 200, 210, { size: 52, weight: 800, family: 'sans', color: css(P.bone), ...ent(0.2) });
    // 一行说明当前这一行的采样密度（不逐个浮三块标签）
    cases.forEach((c, ci) => {
      if (t < 0.5 + ci * 2.0 || t >= 0.5 + (ci + 1) * 2.0) return;
      const yc = 340 + ci * 250;
      type.writeLine(`每周期采样 ${c.label}`, 960, yc - 108, { size: 24, family: 'mono', color: c.ok ? css(P.ash) : css(P.signal), align: 'right' });
    });
    type.writeLine('红线 = 采样点连出来的"重建"', L.x0, 985, { size: 21, family: 'mono', color: css(P.ash), ...ent(0.6) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.18, grain: 0.022 };
  },
});