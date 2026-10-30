// 表情包段（两张，各 ~2.2s）：蓝色大肥鱼按按钮、蓝色大肥鱼点赞。
//
// 素材是 `表情包` 文件夹里的 GIF，用 ffmpeg 抽成 12fps / 320px 的 PNG 序列放在
// `tasks/nekoclicker-intro/assets/<名字>/f001.png …`（GIF 不能直接播：`render(t)` 必须是
// t 的纯函数，播放器的时钟一 seek 就乱 —— 见 src/kit/sticker.js 的说明）。
import { stickerShot } from '../../../src/kit/sticker.js';

const frame = (slug) => (i) => new URL(`../assets/${slug}/f${String(i).padStart(3, '0')}.png`, import.meta.url).href;

export const stClick = stickerShot('st_click', {
  frame: frame('click'),
  count: 4,
  size: 300,
  x: 1420, y: 560,
  kicker: 'CLICK / 这张脸负责让你多点几下',
  caption: '点这里就行',
});

export const stLike = stickerShot('st_like', {
  frame: frame('like'),
  count: 12,
  size: 300,
  x: 1420, y: 560,
  kicker: 'TESTS / 都测过了',
  caption: '稳',
});
