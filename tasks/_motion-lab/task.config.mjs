/**
 * 运动上限（BACKLOG 1-33）标定夹具：两段，一段超限、一段合规。
 * 只有 scenes/over.js 一个文件（两个场景对象），所以"读得出元素个数"这条路是被真的走过的。
 */
import { seq, cut } from '../../src/timeline.js';
import { over, ok } from './scenes/over.js';

export default {
  title: 'motion-lab（运动上限红证明）',
  width: 1920, height: 1080, fps: 60, scale: 1,
  timeline: seq([
    cut(over, { dur: 4 }),
    cut(ok, { dur: 4 }),
  ]),
};
