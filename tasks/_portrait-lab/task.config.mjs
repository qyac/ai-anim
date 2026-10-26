/**
 * 竖屏夹具（BACKLOG 1-52）：1080×1920 + 引擎字幕层 + 语义字号 + 主体声明。
 *
 * 出图：
 *   node scripts/anim.mjs still _portrait-lab -t 3,8
 *   node scripts/anim.mjs check _portrait-lab          # 版面守门 / 背景守门 / 两条路径一致
 *
 * ⚠ `focus` 写在**时间线**上（`cut(…, { focus })`），不是 `makeShot(id, { focus })` ——
 * `makeShot` 只认 `setup` / `draw` / `post` 三个键，其余会被忽略。
 */
import { seq, cut } from '../../src/timeline.js';
import hero from './scenes/hero.js';
import bars from './scenes/bars.js';

export default {
  title: '竖屏夹具',
  width: 1080,
  height: 1920,
  fps: 60,
  style: 'flat',
  captions: true,
  // 手写旁白（`docs/NARRATION.md` 的 B 档写法）：只为让字幕层出现，验证字幕带的位置。
  narration: {
    lines: [
      { id: 'l1', text: '竖屏的字，要比横屏大一号。', start: 0.7, dur: 4.4 },
      { id: 'l2', text: '字幕落在六成一到七成那一带。', start: 5.6, dur: 4.2 },
    ],
  },
  // 镜头长度别平摊（`check` 的节奏腿会报"节拍器"）：7s 铺垫 + 4s 收束。
  timeline: seq([
    cut(hero, { id: 'hero', dur: 7, focus: 'center' }),
    cut(bars, { id: 'bars', dur: 4, focus: 'center' }),
  ]),
};
