// _carry-lab —— carry 词表的动作图册夹具 + 静/动节奏的标定夹具（BACKLOG 1-37 / 1-38）。
//
// 这个任务**不是片子**，是两个量具的标定夹具（写法：C 档手写场景，全走 src/kit/carry.js）：
//   ① 动作图册（1-37）：六个场景文件各演示 src/kit/carry.js 的一个函数 ——
//      morph（morphRect）/ iris / zoom（zoomThrough）/ hop / gather / opcam（operatorCam）。
//      `node scripts/anim.mjs still _carry-lab -t <t> --only <id>` 逐段出图，
//      或 `anim cuts _carry-lab` 看边界衔接。每段开头 0.3s 是静止起手（出图选段内 50-80%）。
//   ② 静/动分段（1-38 的标定样本）：rhythm 段量出「静 0.5 → burst 1.0 → 静 0.8」
//      —— hold、burst、hold，是 REFERENCE-onetake.md §3 两个判据（死静帧占比、最长静段）的正面样本。
//
// 没有音频；每段自铺背景（makeShot 的 draw 里 clear 一次整帧）。
// `check _carry-lab` 必须全绿；`anim carry _carry-lab` 的边界全部声明（图册段之间是
// 刻意的演示边界 —— morph→iris 之间没有衔接物，是图册的分隔，不是片子剪辑）。

import { seq, cut } from '../../src/timeline.js';
import morph from './scenes/morph.js';
import iris from './scenes/iris.js';
import zoom from './scenes/zoom.js';
import hop from './scenes/hop.js';
import gather from './scenes/gather.js';
import opcam from './scenes/opcam.js';
import rhythm from './scenes/rhythm.js';

export default {
  title: 'carry lab（图册 + 节奏标定）',
  width: 1920,
  height: 1080,
  fps: 60,
  scale: 1,

  timeline: seq([
    cut(morph,  { id: 'morph',  dur: 2.4, note: 'morphRect：卡片→窗口的容器形变' }),
    cut(iris,   { id: 'iris',   dur: 2.0, note: 'iris：从主体打开的圆形揭示' }),
    cut(zoom,   { id: 'zoom',   dur: 2.4, note: 'zoomThrough：对数推近穿透成下一场景' }),
    cut(hop,    { id: 'hop',    dur: 1.2, note: 'hop：弧线跳 + 落地挤压（短击）' }),
    cut(gather, { id: 'gather', dur: 3.4, note: 'gather：12 元素扇形收拢成簇（长枪）' }),
    cut(opcam,  { id: 'opcam',  dur: 3.0, note: 'operatorCam：跟拍 + rest 归零 + 落地 shake' }),
    // rhythm 与 opcam 之间刻意硬切：节奏夹具要的就是无转场边界。
    // 段长分布 2.4/2.0/2.4/1.2/3.4/3.0/2.7 —— CoV ≈ 0.27（≥0.25，不是节拍器）：
    // 图册夹具顺便当好节奏的样本，check 的节奏腿不再报它。
    // rhythm 内部：静 0.5 → burst 1.0 → 静 1.2（**静段 ≥1s = 判据线本身**，anim rhythm 必须量得出来）。
    cut(rhythm, { id: 'rhythm', dur: 2.7, note: '静 0.5 → burst 1.0 → 静 1.2（1-38 标定）' }),
  ]),
};
