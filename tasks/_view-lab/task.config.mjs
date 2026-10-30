/**
 * 仪器视图夹具（`src/kit/views.js`）：同一张底图，一种成像方式一段。
 *
 * 出图：`node scripts/anim.mjs still _view-lab -t 2.4 --only ascii,halftone`
 * 全片：`node scripts/anim.mjs sheet _view-lab --from 0 --to 24 -n 16`
 * 回归：`node tools/test-views.mjs`（纯逻辑：模式名 / 默认格子 / 写错要抛）
 */
import { seq, cut } from '../../src/timeline.js';
import { viewShot } from './scenes/view.js';

export default {
  title: '仪器视图夹具',
  width: 1920,
  height: 1080,
  fps: 60,
  style: 'print',
  timeline: seq([
    cut(viewShot('halftone', 'halftone', { label: 'HALFTONE / 半调印刷', note: 'cell 7 · 27 度网角' }), { id: 'halftone', dur: 3 }),
    cut(viewShot('ascii', 'ascii', { cell: 22, label: 'ASCII / 字符画', note: 'cell 22 · 5x7 点阵，11 级' }), { id: 'ascii', dur: 3 }),
    cut(viewShot('dither', 'dither', { cell: 3, label: '1-BIT / 抖动', note: 'Bayer 4x4 · 只有黑白两色' }), { id: 'dither', dur: 3 }),
    cut(viewShot('posterize', 'posterize', { levels: 4, label: 'POSTERIZE / 四阶平涂', note: 'levels 4 · 丝印套色' }), { id: 'posterize', dur: 3 }),
    cut(viewShot('thermal', 'thermal', { label: 'THERMAL / 热成像', note: '亮度 -> 冷热色带' }), { id: 'thermal', dur: 3 }),
    cut(viewShot('pixel', 'pixel', { cell: 8, label: 'PIXEL / 像素化', note: 'cell 8 · 最近邻' }), { id: 'pixel', dur: 3 }),
    cut(viewShot('crt', 'crt', { cell: 4, label: 'CRT / 显像管', note: '扫描线 + 荫罩 + 桶形' }), { id: 'crt', dur: 3 }),
    cut(viewShot('engrave', 'engrave', { cell: 7, label: 'ENGRAVE / 雕版排线', note: '45 度 · 暗处线宽' }), { id: 'engrave', dur: 3 }),
  ]),
};
