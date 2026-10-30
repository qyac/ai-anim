/**
 * 整片介质夹具（`style.view`，BACKLOG 1-63）：整支片子由风格包的 `view` 决定介质。
 *
 * 用的是 `h-vhs`（CRT 荫罩 + 胶片磨损三件套）：场景与模板**一行都没改**，
 * 画面里的标题、图表、刻度全是引擎照常画的，只是最后被整帧印成了 CRT。
 *
 * 出图：`node scripts/anim.mjs still _style-view-lab -t 2.5`
 * 对照（同一时刻、换回 print）：`still _style-view-lab -t 2.5 --style print`
 * 相关断言：`node tools/test-style.mjs`（view 默认 off / 写错抛 / 样式字段）
 */
export default {
  title: '整片介质夹具',
  width: 1920, height: 1080, fps: 60,
  style: 'h-vhs',
  timeline: [
    { type: 'title', title: '整片换成 CRT', sub: 'style: h-vhs · view: crt · 磨损三件套', dur: 5 },
    { type: 'chart', values: [0.35, 0.6, 0.85], title: '连图表一起被印上', dur: 5 },
  ],
};
