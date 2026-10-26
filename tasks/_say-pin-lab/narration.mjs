// 离线验收 `anim say --pin-timing`（BACKLOG 1-23）用的夹具旁白。
// 两段、每段两句 —— 够验「同 id 沿用 / 变长重解 / 部分钉住」三种。
export const VOICE = 'fake';
export const TAIL = 1.2;
export const MAX_STRETCH = 1.9;
export const BPM = 72;
export const SCENES = [
  { id: 'first', internal: 3.2, lines: [
    { cue: 0.4, text: '先看一句话。' },
    { cue: 1.8, text: '这串声音，叫旁白。' },
  ] },
  { id: 'second', internal: 3.0, lines: [
    { cue: 0.3, text: '每一段的长度由它决定。' },
    { cue: 1.9, text: '不是平摊。' },
  ] },
];