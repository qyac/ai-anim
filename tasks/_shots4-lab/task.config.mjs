/**
 * 镜头库第四批新模板的标定夹具（BACKLOG 1-48 收尾批：timeline / radial）。
 *
 * 前 2 段 = 两个模板的默认画面；后 2 段 = 非默认分支：
 *   timeline-many   七个事件（接近"超过 7 个会挤"的告警线，验上下交替布局）
 *   radial-1        单节点 + 空 kicker + footer 空串（验 n=1 的中心对称与"空串不画"）
 *
 *   node scripts/anim.mjs check _shots4-lab
 *   node scripts/anim.mjs still _shots4-lab -t 3,9,15,21
 *
 * ⚠ 夹具，不是片子：radial 的 weights 是示意读数，没有事实表（也不该有）。
 */
export default {
  title: 'shots4-lab（第四批模板标定）',
  width: 1920, height: 1080, fps: 60, scale: 1,
  timeline: [
    { type: 'timeline', dur: 6, world: false, focus: 'center' },
    { type: 'radial', dur: 6, world: false,
      // focus 声明主体在中心 46%×50%（版面守门：不声明=没判，不是通过）
      focus: { cx: 960, cy: 540, w: 900, h: 560 } },

    { type: 'timeline', id: 'timeline-many', dur: 6, world: false,
      kicker: 'TIMELINE / 七步',
      title: '步子多一点',
      events: ['立项', '原型', '内测', '修正', '公测', '定型', '发布'],
      footer: '上下交替的布局在七步时还能读',
      focus: 'center' },

    { type: 'radial', id: 'radial-1', dur: 6, world: false,
      kicker: '',
      title: '只有一个节点',
      nodes: ['闭环'],
      weights: [0.5],
      footer: '',
      focus: { cx: 960, cy: 540, w: 900, h: 560 } },
  ],
};
