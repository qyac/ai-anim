/**
 * 母题夹具（BACKLOG 1-49）：`src/kit/motifs/` 的两个母题各一段。
 *
 * 出图：`node scripts/anim.mjs still _motif-lab -t 2,7`
 * 回归：`node tools/test-motifs.mjs`（38 项纯逻辑）
 */
import { seq, cut } from '../../src/timeline.js';
import fourier from './scenes/fourier.js';
import dct from './scenes/dct.js';

export default {
  title: '母题夹具',
  width: 1920,
  height: 1080,
  fps: 60,
  style: 'print',
  timeline: seq([
    cut(fourier, { id: 'fourier', dur: 6, focus: 'center' }),
    cut(dct, { id: 'dct', dur: 5, focus: 'center' }),
  ]),
};
