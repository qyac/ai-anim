// NekoClicker 介绍片的旁白（12 段，约 35 秒）。
//
//   node scripts/anim.mjs say nekoclicker-intro --rate +6%
//   node scripts/anim.mjs mix nekoclicker-intro --target streaming
//
// 纪律：① 一句只讲一件事，不复述画面上的字；② internal 越接近段长，画面越不会被放慢
//（wantStretch = need / internal，用户嫌第一版慢，所以这里把 stretch 压在 1.0 附近）；
// ③ OVERLAP 必须与时间线一致 —— 时间线是首尾相接，所以这里是 0。
export const VOICE = 'zh-CN-YunxiNeural';
export const TAIL = 0.55;
export const MAX_STRETCH = 1.35;
export const BPM = 84;
export const OVERLAP = 0;

export const SCENES = [
  { id: 'open', internal: 3.0, lines: [ { cue: 0.3, text: '这是 NekoClicker。' } ] },
  { id: 'what', internal: 2.0, lines: [ { cue: 0.25, text: '点一下就长。' } ] },
  { id: 'loop', internal: 2.4, lines: [ { cue: 0.3, text: '点击、造建筑、升级。' } ] },
  { id: 'st_click', internal: 1.5, lines: [ { cue: 0.1, text: '点这里。' } ] },
  { id: 'pack1', internal: 1.6, lines: [ { cue: 0.2, text: '内容装成包。' } ] },
  { id: 'pack2', internal: 2.2, lines: [ { cue: 0.2, text: '猫咖、轮回。' } ] },
  { id: 'pack3', internal: 1.5, lines: [ { cue: 0.2, text: '一共十一个。' } ] },
  { id: 'tests', internal: 3.0, lines: [ { cue: 0.3, text: '六百零二个用例。' } ] },
  { id: 'st_like', internal: 1.5, lines: [ { cue: 0.1, text: '都测了。' } ] },
  { id: 'hosts', internal: 3.7, lines: [ { cue: 0.3, text: '终端与网页，同一份引擎。' } ] },
  { id: 'api', internal: 2.3, lines: [ { cue: 0.2, text: '接口只增不改。' } ] },
  { id: 'end', internal: 1.9, lines: [ { cue: 0.2, text: '一点一三点零。' } ] },
];
