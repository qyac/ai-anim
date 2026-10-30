/**
 * 镜头库第三批新模板的标定夹具（BACKLOG 1-48 第二批：morph / layers / lockup）。
 *
 * 前 3 段 = 三个模板的**默认画面**；后 3 段 = 不是默认值的那几条分支：
 *   morph-flat   只有两个数据点 + 标题很短 + footer 空串（验 n 的下限与柱宽）
 *   layers-6     六层 + 空眉标（验层数上限后"最远的几张只剩一条边"这件事）
 *   lockup-diamond 菱形标记 + 有页脚 + meta 空串（验形状与"空串不画"）
 *
 *   node scripts/anim.mjs check _shots3-lab
 *   node scripts/anim.mjs still _shots3-lab -t 3,9,15,21,27,33
 *
 * ⚠ 夹具，不是片子：画面里的数是示意读数，没有事实表（也不该有）。
 */
export default {
  title: 'shots3-lab（第三批模板标定）',
  width: 1920, height: 1080, fps: 60, scale: 1,
  timeline: [
    { type: 'morph', dur: 6, world: false },
    { type: 'layers', dur: 6, world: false },
    { type: 'lockup', dur: 6, world: false },

    { type: 'morph', id: 'morph-flat', dur: 6, world: false,
      values: [0.35, 0.78],
      title: '两点',
      sub: 'MORPH / 两个数据点',
      footer: '' },

    { type: 'layers', id: 'layers-6', dur: 6, world: false,
      kicker: '',
      sheets: 6,
      title: '六层叠起来' },

    { type: 'lockup', id: 'lockup-diamond', dur: 6, world: false,
      mark: 'diamond',
      kicker: 'LOCKUP / 菱形',
      name: '换一个标记',
      tagline: 'DIAMOND',
      meta: '',
      footer: '有页脚、没有署名行' },
  ],
};
