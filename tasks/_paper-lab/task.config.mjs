/**
 * 纸艺 / 剪纸层叠夹具（BACKLOG 1-49 能力缺口表第 5 行，覆盖素材包 20 条）。
 *
 * 判断标准只有一条：**看起来像剪下来贴上去的纸**，而不是"一堆彩色多边形"。
 * 三条缺一件就退化成后者：硬投影（不是模糊阴影）/ 分形撕边 + 白芯（不是锯齿线）/ 纸色有纤维（不是纯色）。
 *
 * 出图：node scripts/anim.mjs still _paper-lab -t 2,6
 * 短片：node scripts/anim.mjs shot _paper-lab --from 0 --to 6
 * 回归：node tools/test-paper.mjs（撕边确定性 / 白芯几何 / 层序 / 投影方向，不需要 GPU）
 */
import { seq, cut } from '../../src/timeline.js';
import paper from './scenes/paper.js';

export default {
  title: '纸艺层叠夹具',
  width: 1920, height: 1080, fps: 60, scale: 1,
  style: 'print',
  timeline: seq([
    cut(paper, { id: 'paper', dur: 8, note: '一叠撕边纸：硬投影 / 白芯 / 纤维 / 视差' }),
  ]),
};
