/**
 * NekoClicker 介绍片 · 有声版（33.6s）。
 *
 * 时间源换成了**旁白**（docs/NARRATION.md §6.5）：每段 `dur` 取 `audio/timing.json` 的 `slot`，
 * 所以改一句词 → 重跑 `say` → 段长自己变；画面模板不用动。
 *
 * 三层音频：
 *   music  84bpm 合成床（scripts/make-demo-audio.mjs，零版权素材）
 *   vo     edge-tts 逐句合成（zh-CN-YunxiNeural，+6% 语速）
 *   mix    `anim mix` 把旁白摆位 + 给床做闪避，混成**一条**交给引擎
 *
 * 有旁白 ⇒ `captions: true`（引擎每帧画当前那句；画面文字只放标注，不复述旁白）。
 */
import timing from './audio/timing.mjs';
import { seq, cut } from '../../src/timeline.js';
import { stClick, stLike } from './scenes/sticker.js';
import { packFlash } from './scenes/packflash.js';

const dur = (id) => {
  const s = timing.scenes.find((x) => x.id === id);
  if (!s) throw new Error('timing.json 里没有段 ' + id + ' —— 先跑 anim say');
  return s.slot;
};

export default {
  title: 'NekoClicker · 增量游戏框架',
  width: 1920, height: 1080, fps: 60, scale: 1,
  style: 'blueprint',
  audio: {
    music: './audio/bed.wav',
    vo: './audio/nekoclicker-intro-vo.mp3',
    mix: './audio/nekoclicker-intro-mix.mp3',
  },
  narration: './audio/narration.json',
  captions: true,
  timeline: seq([
    {
      type: 'title', id: 'open', dur: dur('open'), focus: 'center', maxSamples: 16,
      eyebrow: 'NEKOCLICKER / C# · .NET 8',
      title: 'NekoClicker',
      sub: '增量游戏框架 · 零第三方依赖',
      blur: 14,
    },
    {
      type: 'bigtype', id: 'what', dur: dur('what'), focus: 'center', maxSamples: 16,
      kicker: 'WHAT / 01',
      line1: '点一下，', line2: '猫就开始自己干活',
      mark: '自己',
      footer: '参考 Cookie Clicker 的机制设计',
    },
    {
      type: 'timeline', id: 'loop', dur: dur('loop'), focus: 'center', maxSamples: 16,
      kicker: 'LOOP / 02',
      title: '一层的玩法循环',
      events: ['点击', '建筑产速', '升级', '成就', '纪元'],
      footer: '每座建筑 +0.5% 点击收益（最多算 120 座）',
    },
    // 表情包：蓝色大肥鱼按按钮（1 段 ~2s，装饰，不是主体）
    cut(stClick, { dur: dur('st_click'), focus: 'center', maxSamples: 16 }),
    // 十一个内容包快闪：一段里切 11 个名字（0.45s 一闪）
    cut(packFlash, { dur: dur('packs'), focus: 'center', maxSamples: 16 }),
    {
      type: 'counter', id: 'tests', dur: dur('tests'), focus: 'center', maxSamples: 16,
      from: 0, to: 602, decimals: 0,
      label: '引擎用例',
      sub: '自研迷你运行器 · 一条命令全跑',
      footer: 'neko-clicker/STATUS.md',
    },
    // 表情包：点赞（"都测过了"）
    cut(stLike, { dur: dur('st_like'), focus: 'center', maxSamples: 16 }),
    {
      type: 'device', id: 'hosts', dur: dur('hosts'), focus: 'center', maxSamples: 16,
      kicker: 'HOST / 06',
      chrome: 'nekoclicker',
      // ⚠ 不许写「终端与网页，同一份引擎」——那是旁白原句（lint-narration-dup 会点名）；
      //   画面只放标注：两个宿主的名字。
      title: 'terminal ／ web',
      rows: 3,
      footer: '离线也照样累积，回来结算',
    },
    {
      type: 'kinetic', id: 'api', dur: dur('api'), focus: 'center', maxSamples: 16,
      headline: ['公开 API', '只增不改'],
      sub: '从 1.0.0 起，有测试守着',
    },
    {
      type: 'outro', id: 'end', dur: dur('end'), focus: 'center', maxSamples: 16,
      title: 'NekoClicker',
      sub: 'v1.13.0 · C# / .NET 8',
      signature: '零第三方依赖 · 十一个内容包',
    },
  ]),
};
