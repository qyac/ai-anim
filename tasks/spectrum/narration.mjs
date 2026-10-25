// @ts-check
/**
 * 《把信号拆开》—— 旁白脚本（**唯一的时间源**）。
 *
 * 用户的取向：**纯炫技的原理展示**，旁白"极短"。
 * 所以每一段最多两句、每句不超过 14 个字 —— 画面是主角，旁白只在揭晓的那一刻说一句。
 *
 * 时长不在这里定：改了台词就重跑
 *   node scripts/anim.mjs say spectrum
 * 由它逐句量出真实时长、反推每段的 `slot` 与画面放慢系数 `stretch`。
 *
 * 事实底稿在 `FACTS.md`：画面上的每个数字都要在里面找得到出处。
 */

export const VOICE = 'zh-CN-YunxiNeural';
export const RATE = '+2%';
/** 每段最后一句说完之后至少留这么久画面（秒）—— 这支片子画面是主角，留白给足 */
export const TAIL = 2.8;
/** 画面最多放慢几倍 */
export const MAX_STRETCH = 1.9;
/** 配乐 72bpm（一拍 0.8333 秒），与 scripts/make-spectrum-audio.mjs 的床一致 */
export const BPM = 72;

/**
 * 每一段：`internal` = 画面最后一次揭晓发生在段内第几秒（旁白按它来放慢画面），
 * `lines[].cue` = 说这句时画面应该走到哪。
 */
export const SCENES = [
  {
    id: 'hook',
    internal: 4.4,
    lines: [
      { cue: 0.6, text: '一个方波。' },
      { cue: 2.6, text: '它由什么组成？' },
    ],
  },
  {
    id: 'series',
    internal: 12.4,
    lines: [
      { cue: 0.6, text: '一串圆，一个接一个转。' },
      { cue: 4.4, text: '圆越多，边越尖。' },
    ],
  },
  {
    id: 'sound',
    internal: 6.2,
    lines: [
      { cue: 0.6, text: '声音也一样。' },
      { cue: 3.4, text: '任何一段声音，都能拆成纯音。' },
    ],
  },
  {
    id: 'image',
    internal: 8.0,
    lines: [
      { cue: 0.6, text: '图像也一样。' },
      { cue: 3.6, text: '切成小块，每块拆成频率。' },
    ],
  },
  {
    id: 'keep',
    internal: 9.6,
    lines: [
      { cue: 0.6, text: '留下低频，它变糊。' },
      { cue: 3.4, text: '只留高频，只剩边。' },
    ],
  },
  {
    id: 'sample',
    internal: 5.4,
    lines: [
      { cue: 0.6, text: '采样太少，会听见不存在的音。' },
    ],
  },
  {
    id: 'outro',
    internal: 2.6,
    lines: [
      { cue: 0.6, text: '万物皆可拆。' },
    ],
  },
];