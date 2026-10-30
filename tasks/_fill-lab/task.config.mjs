/**
 * 填充面夹具（src/core/fill.js）：一屏六种「面」。
 *
 * 出图：node scripts/anim.mjs still _fill-lab -t 2
 * 回归：node tools/test-fill.mjs（30 项纯逻辑）
 */
import { seq, cut } from '../../src/timeline.js';
import shapes from './scenes/shapes.js';

export default {
  title: '填充面夹具',
  width: 1920,
  height: 1080,
  fps: 60,
  style: 'print',
  timeline: seq([cut(shapes, { id: 'shapes', dur: 6 })]),
};