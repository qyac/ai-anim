// @ts-check
/**
 * 短击 `burst` —— 2.6 秒的纯视觉过门（**没有旁白**，所以不进 narration.mjs）。
 *
 * 为什么要有它：全片 8 段都是 8–13 秒的长枪，`check` 的节奏腿判 CoV 0.21 = 节拍器
 * （onetake 的三版教训：匀速镜头长度在观众眼里就是"一格一格翻灯片"）。
 * 这一记短打把"声音"段的最后 2.6 秒接过来：真实波形塌缩成一根竖线，再炸开成频谱柱。
 *
 * 它不是装饰 —— 塌缩的正是上一段那条**真实 PCM 波形**，炸开的是下一段的频段柱。
 */
import { css, sat, prog, ease } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';
import { L, signal, muted } from './_kit.js';
import wave from '../audio/wave.json' with { type: 'json' };

const PTS = wave.points;

export default makeShot('burst', {
  draw(ctx) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const t = f.lt;                       // 没有旁白 ⇒ 不需要 stretch
    const yMid = 560;
    const xMid = 960;
    const wx0 = L.x0, wx1 = 940;
    const ampPx = 165;

    // 0 → 0.55 塌缩（波形收成一根线）；0.55 → 1 炸开成三组柱
    const col = ease.inCubic(sat(t / 0.55));
    const burst = ease.outCubic(sat((t - 0.85) / 0.75));

    lines.begin();
    // 塌缩：每一列从原位向中线收拢，横向位置与宽度都乘 (1 - col)
    const n = 150;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor((i / n) * (PTS.length - 1));
      const [mn, mx] = PTS[idx];
      const x0 = wx0 + (wx1 - wx0) * (idx / (PTS.length - 1));
      const x = x0 + (xMid - x0) * col;
      const a = 0.9 * (1 - sat((col - 0.75) / 0.25));
      if (a <= 0.01) continue;
      lines.seg(x, yMid - mx * ampPx * (1 - col * 0.6), x, yMid - mn * ampPx * (1 - col * 0.6), 1.6, [P.ink[0], P.ink[1], P.ink[2], a]);
    }
    // 收成的那根竖线
    if (col > 0.35) {
      const la = sat((col - 0.35) / 0.4) * (1 - sat(burst * 2));
      lines.seg(xMid, yMid - 300, xMid, yMid + 300, 2.6, signal(P, 2.2, la));
      lines.seg(xMid, yMid - 300, xMid, yMid + 300, 8.0, signal(P, 1, la * 0.18));
    }
    // 炸开：三组柱从中心向外推开
    if (burst > 0) {
      const groups = [1210, 1400, 1590];
      groups.forEach((gx, gi) => {
        const x = xMid + (gx - xMid) * burst;
        for (let j = 0; j < 5; j++) {
          const h = (150 + Math.sin(j * 1.7 + gi) * 60) * burst;
          lines.seg(x + j * 26, yMid + 120, x + j * 26, yMid + 120 - h, 13, signal(P, 1.5, burst));
        }
      });
    }
    lines.flush(ctx.out);

    // 这一记是纯视觉，不放任何数 —— 只留一个段标
    text.clear();
    type.writeLine('SIGNAL / 03b', L.x0, 128, { size: 24, family: 'mono', color: css(P.ash), alpha: sat(t * 2) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.34, grain: 0.03 };
  },
});