// @ts-check
/**
 * 第 3 段 `sound` —— 声音也一样：任何一段声音都能拆成纯音。
 *
 * ⚠ **左边那条波形是真实数据**：`scripts/extract-spectrum-wave.mjs` 用 ffmpeg 从
 * `audio/bed.mp3` 解出 2.4 秒 PCM 存成 `audio/wave.json`（每点 = [窗内最小, 窗内最大]）。
 * 不合成、不美化 —— 画面上出现的形状必须真的来自那段音频。
 * 右边频谱读数来自 `anim analyze` 的 bed.analysis.json（low / mid / high 三路包络）。
 */
import { css, sat, prog } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';
import { L, ink, signal, muted } from './_kit.js';
import wave from '../audio/wave.json' with { type: 'json' };

const PTS = wave.points;

export default makeShot('sound', {
  draw(ctx) {
    const { f, lines, text, type, P, comp, gl, music } = ctx;
    const t = f.lt / (ctx.params?.stretch ?? 1);
    const yMid = 560;
    const wx0 = L.x0, wx1 = 940;
    const ampPx = 165;

    // 波形按真实采样画：每点一条竖线（最小→最大）—— 就是示波器的写法
    const reveal = prog(t, 0.3, 3.0, 'outCubic');
    const shown = Math.floor(PTS.length * reveal);

    lines.begin();
    lines.seg(wx0, yMid, wx1, yMid, 1, muted(P, 0.26));
    for (let i = 0; i < shown; i++) {
      const x = wx0 + (wx1 - wx0) * (i / (PTS.length - 1));
      const [mn, mx] = PTS[i];
      lines.seg(x, yMid - mx * ampPx, x, yMid - mn * ampPx, 1.4, ink(P, 0.92));
    }

    // 频谱：三组柱，读数**实时**来自真实包络（不是随机数）
    const bands = [
      { name: 'LOW', key: 'low', x: 1090 },
      { name: 'MID', key: 'mid', x: 1360 },
      { name: 'HIGH', key: 'high', x: 1630 },
    ];
    const grow = prog(t, 1.4, 4.2, 'outCubic');
    const baseY = 830, maxH = 240;
    // 读数跟着**整片时间**走（f.t 是绝对时间，不是段内时间），才能对上这段真实音频
    const tAbs = f.t;
    bands.forEach((b, bi) => {
      const vals = [];
      // 每根柱 = 那一刻该频段的包络（5 个连续采样点，柱形随音乐动）
      for (let j = 0; j < 5; j++) {
        const live = music && music.hasAudio ? music.at(tAbs + j * 0.13 + bi * 0.04) : null;
        vals.push(Math.max(0.05, Math.min(1, live?.[b.key] ?? 0.2)));
      }
      vals.forEach((v, j) => {
        const a = sat(grow * 6 - j * 0.45 - bi * 0.7);
        if (a <= 0) return;
        const x = b.x + j * 32;
        const h = maxH * v * a;
        lines.seg(x, baseY, x, baseY - h, 15, signal(P, 1, 0.85));
      });
      lines.seg(b.x - 10, baseY + 14, b.x + 4 * 32 + 10, baseY + 14, 1, muted(P, 0.4));
    });
    lines.flush(ctx.out);

    text.clear();
    const ent = (d) => ({ alpha: [0, 1], t, staggerDur: 0.5 });
    type.writeLine('SIGNAL / 03', L.x0, 128, { size: 24, family: 'mono', color: css(P.ash), ...ent(0) });
    type.writeLine('声音', 200, 268, { size: 56, weight: 800, family: 'sans', color: css(P.bone), ...ent(0.2) });

    // 所有标注压成一行页脚 —— 分散的小标签会被版面守门算成多个"看的地方"
    type.writeLine('波形 2.4 s　·　LOW / MID / HIGH　·　两处读数都取自本片配乐', L.x0, 985, { size: 21, family: 'mono', color: css(P.ash), ...ent(0.6) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.18, grain: 0.022 };
  },
});