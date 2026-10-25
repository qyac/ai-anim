import { seq, cut } from '../../src/timeline.js';
import { worldPass } from '../../src/kit/index.js';
import timing from './audio/timing.mjs';
import hook from './scenes/hook.js';
import series from './scenes/series.js';
import series2 from './scenes/series2.js';
import burst from './scenes/burst.js';
import sound from './scenes/sound.js';
import image from './scenes/image.js';
import keep from './scenes/keep.js';
import sample from './scenes/sample.js';
import outro from './scenes/outro.js';

export const world = (ctx) => worldPass(ctx, { grid: 64, motif: 'auto', accent: ctx.P.signal });

const S = (id) => {
  const s = timing.scenes.find((x) => x.id === id);
  if (!s) throw new Error(`timing.mjs 里没有 ${id} —— 先跑 anim say spectrum`);
  return s;
};

/**
 * `maxSamples: 8` —— 这一段最多用 24 个子帧做运动模糊。
 *
 * 为什么写死：这支片子的主体是**静止的图表**（方波、8×8 格子、采样点），
 * 唯一的运动是入场那 2–3 秒与游标。自适应采样在"画面已静止"的帧上仍然会
 * 一路加到 72 子帧，因为它量的是相邻两组子帧的差异，而后处理里的**颗粒**
 * 每帧种子不同 —— 静止画面也永远收敛不到 tol 以下。
 * 代价（实测）：自适应 0.9 fps（整片 ~85 分钟），限到 8 子帧后实测 2.5 fps（整片 ~30 分钟）；
 * 而静止帧的运动模糊本来就是同一张图平均 N 次，看不出区别。
 * 这个旋钮是**提速**用的，只会往下压（`src/core/engine.js:711`）。
 */
const seg = (id, scene, focus, note) => {
  const s = S(id);
  return cut(scene, {
    at: s.start, dur: s.slot, overlap: timing.overlap, world: 'auto', focus,
    maxSamples: 8,
    params: { stretch: s.stretch },
    note: `${note}（${s.slot}s · 放慢 ${s.stretch}×）`,
  });
};

export default {
  title: '把信号拆开',
  width: 1920, height: 1080, fps: 60, scale: 1,
  style: 'paper',
  captions: true,
  audio: { music: './audio/bed.mp3', vo: './audio/spectrum-vo.mp3', mix: './audio/spectrum-mix.mp3' },
  narration: './narration.json',
  timeline: seq([
    seg('hook', hook, { x: 140, y: 330, w: 1640, h: 500 }, '第 1 段 · 一个方波'),
    // 第 2 段的一镜到底拆成两个视觉镜头（同一个旁白 slot，说完"圆越多边越尖"再放大看边角）：
    // A 段 9.0s + B 段 6.0s，各加一个 overlap，合起来正好填满 timing 给的 15.833s。
    cut(series, { at: S('series').start, dur: 9.0 + timing.overlap, overlap: timing.overlap, world: 'auto',
      maxSamples: 8, focus: { x: 200, y: 300, w: 1540, h: 520 }, params: { stretch: S('series').stretch },
      note: '第 2 段 · 一串圆加起来（前 9 秒）' }),
    cut(series2, { at: S('series').start + 9.0, dur: 6.0 + timing.overlap, overlap: timing.overlap, world: 'auto',
      maxSamples: 8, focus: { x: 260, y: 380, w: 1480, h: 440 }, params: { stretch: S('series').stretch },
      note: '第 2b 段 · 边角放大（后 6 秒，同一段旁白）' }),

    cut(sound, { at: S('sound').start, dur: 9.9 + timing.overlap, overlap: timing.overlap, world: 'auto',
      maxSamples: 8, focus: { x: 140, y: 400, w: 1640, h: 470 }, params: { stretch: S('sound').stretch },
      note: '第 3 段 · 声音也能拆（前 9.9 秒）' }),
    // 一记 2.6 秒的纯视觉过门（没有旁白）：波形塌缩成一根线，再炸开成频谱柱。
    cut(burst, { at: S('sound').start + 9.9, dur: 2.6 + timing.overlap, overlap: timing.overlap, world: 'auto',
      maxSamples: 72, focus: 'center', note: '短击 · 波形塌缩 → 频谱柱（这一记真的在动，给到 72 子帧）' }),
    seg('image', image, { x: 240, y: 320, w: 1420, h: 540 }, '第 4 段 · 图像也能拆'),
    seg('keep', keep, { x: 220, y: 340, w: 1120, h: 400 }, '第 5 段 · 留下哪些频率'),
    seg('sample', sample, { x: 140, y: 240, w: 1640, h: 700 }, '第 6 段 · 采样太少'),
    seg('outro', outro, { x: 660, y: 380, w: 600, h: 400 }, '第 7 段 · 收尾'),
  ]),
};