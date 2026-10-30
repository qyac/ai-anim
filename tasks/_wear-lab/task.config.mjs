/**
 * 胶片磨损夹具（`post.weave` / `post.flicker` / `post.scratch`，BACKLOG 1-64）。
 *
 * 四段各开一件，最后一段三件套全开 —— 判断标准只有一条：
 * **「这是一盘放了很久的带子」**，而不是「画面在抖 / 在闪 / 被划了」。
 * 所以每段的参数都是 1.0（夹具要看满幅效果），成片里的常用档是小得多（见 h-vhs 风格包）。
 *
 * 出图：`node scripts/anim.mjs still _wear-lab -t 2,6,10,14`
 * 短片：`node scripts/anim.mjs shot _wear-lab --from 0 --to 8`
 * 回归：`node tools/test-post-wear.mjs`（默认全 0 / 只吃 t / 零开销守卫）
 */
export default {
  title: '胶片磨损夹具',
  width: 1920, height: 1080, fps: 60,
  style: 'print',
  timeline: [
    { type: 'title', title: 'WEAVE / 片门晃动', sub: 'post.weave = 1.0 · 横向 ±2px 低频漂移', dur: 4, post: { weave: 1.0 } },
    { type: 'chart', values: [0.35, 0.52, 0.44, 0.72, 0.61, 0.88], title: 'FLICKER / 放映闪烁', dur: 4, post: { flicker: 1.0 } },
    // 划痕的演示段用**纸面图表**：亮底上它发暗（脏东西挡光），比深色网格段看得清
    { type: 'chart', values: [0.4, 0.65, 0.5, 0.8], title: 'SCRATCH / 划痕', dur: 4, post: { scratch: 1.0 } },
    { type: 'chart', values: [0.3, 0.6, 0.9], title: 'ALL / 三件套全开', dur: 4, post: { weave: 0.7, flicker: 0.7, scratch: 0.7 } },
  ],
};
