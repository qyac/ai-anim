/**
 * 仪器视图第二组夹具（BACKLOG 1-68；素材包缺口表第 10 行，覆盖 L30 L31 O3 O10 Z10）。
 *
 * 只验一件事：**排线按明暗加方向**。engrave 只有一个方向、靠线宽表达明暗，
 * 暗部只能一路加粗到粘成实黑；woodcut 是「亮部一道线 → 中间调交叉两道 → 暗部三道，每层更细」。
 *
 * ⚠ 整片介质（style.view）是**任务级**字段，不能写在节点上 —— 所以对照组拆成两个任务：
 *   _hatch-lab        woodcut（多方向）
 *   _hatch-lab-eng    engrave（单方向，对照）
 * 两份时间线与场景**逐字相同**，只差 style.view 那一行，出图可以直接并排看。
 *
 *   node scripts/anim.mjs still _hatch-lab     -t 1
 *   node scripts/anim.mjs still _hatch-lab-eng -t 1
 */
import { seq, cut } from '../../src/timeline.js';
import hatch from './scenes/hatch.js';

export default {
  title: 'hatch-lab-eng（单方向对照）',
  width: 1920, height: 1080, fps: 60, scale: 1,
  style: {
    name: 'flat',           // 浅纸底 + 无颗粒：排线自己的密度就是画面
    view: { mode: 'engrave', cell: 7 },
  },
  timeline: seq([
    cut(hatch, { dur: 3, world: false, focus: 'center' }),
  ]),
};
