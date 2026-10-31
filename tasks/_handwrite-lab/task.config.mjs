/**
 * 手写笔迹标定夹具（BACKLOG 1-69；素材包缺口表第 6 行，覆盖 17 条）。
 *
 * 判断标准只有一条：**它看起来像有人一笔一笔写上去的**，而不是「给折线加了个抖动」。
 * 这件事的全部信息量在**宽度沿弧长的分布**：落笔细、行笔粗、收笔细。
 * 四段刻意错开四个介质，每个都换掉一件东西：
 *
 *   handwrite-default   白板 + default 笔压（1.4px 的重描抖动）
 *   handwrite-paper     笔记本（暖纸 + 横格线）+ 更大的抖动（像手绘动画）
 *   handwrite-wide      更粗的笔（width 由模板内部定，换的是 mode 与 seed）
 *   handwrite-noboil    重描抖动关掉（0）：用来证明「抖动 ≠ 笔压」
 *
 * ⚠ 夹具，不是片子：画面上的字都是中性示范句，没有数字（数字要有出处）。
 *
 *   node scripts/anim.mjs check _handwrite-lab
 *   node scripts/anim.mjs still _handwrite-lab -t 2,4
 *
 * ⚠ 段长刻意不等（4 / 7 / 3 / 6.5，CoV 0.33）：等长会挂一条「节拍器」告警，
 *   而那条告警对**标定夹具**没有意义 —— 让它一直挂着，别人就分不清
 *   「这是夹具的常态」与「这条真的坏了」。
 */
export default {
  title: 'handwrite-lab（手写笔迹标定）',
  width: 1920, height: 1080, fps: 60, scale: 1,
  timeline: [
    { type: 'handwrite', dur: 4, world: false, focus: 'center',
      kicker: 'HANDWRITE / 白板', title: '一笔一笔写',
      sub: '落笔细 · 行笔粗',
      footer: '笔压 = 宽度沿弧长的包络（不是抖动）' },

    { type: 'handwrite', id: 'handwrite-paper', dur: 7, world: false, focus: 'center',
      mode: 'paper', seed: 11, boil: 2.2,
      kicker: 'HANDWRITE / 纸感笔记',
      title: '纸感手写笔记',
      sub: '每 2 帧重描一次',
      footer: '纸上：暖底 + 横格线 + 红边线（mode: paper）' },

    { type: 'handwrite', id: 'handwrite-wide', dur: 3, world: false, focus: 'center',
      seed: 21, boil: 1.0,
      kicker: 'HANDWRITE / 另一支笔',
      title: '换一支笔',
      sub: '同一个模板，不同的种子',
      footer: '种子换掉：笔迹的噪声与抖动都不同（确定性，可 seek）' },

    { type: 'handwrite', id: 'handwrite-noboil', dur: 6.5, world: false, focus: 'center',
      mode: 'paper', seed: 31, boil: 0,
      kicker: 'HANDWRITE / 关掉抖动',
      title: '一笔到底',
      sub: 'boil: 0 —— 没有重描',
      footer: '抖动量 0：宽度变化还在，所以「笔压」不是抖动给的' },
  ],
};