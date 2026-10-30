/**
 * `--pin-timing` 的夹具任务（BACKLOG 1-23）。它不追求画面，只追求「旁白时长解算可复现」。
 *
 *   node scripts/anim.mjs say _say-pin-lab --tts "node tools/fake-tts.mjs"
 *   node scripts/anim.mjs say _say-pin-lab --tts "node tools/fake-tts.mjs" --pin-timing
 *
 * 两段的时长由 narration.mjs 决定；timeline 里写死秒数（这个夹具不 import timing）。
 */
export default {
  title: 'say-pin-lab（--pin-timing 夹具）',
  width: 1920, height: 1080, fps: 60, scale: 1,
  timeline: [
    { type: 'bigtype', dur: 8, world: false, kicker: 'PIN / 01', line1: '第一段', line2: '时间线不动' },
    { type: 'bigtype', dur: 8, world: false, kicker: 'PIN / 02', line1: '第二段', line2: '只看时长' },
  ],
};
// 表可以指向任意一份（BACKLOG 1-23 第三块）：
//   node scripts/anim.mjs say _say-pin-lab --tts "node tools/fake-tts.mjs" --table en
//   → audio/en.narration.json + audio/en.timing.json（默认那份不动）
// 想用哪份就把它写进来 —— 这就是多语言 / 剪短版 / 回放旧表的落点：
//   narration: './audio/en.narration.json',