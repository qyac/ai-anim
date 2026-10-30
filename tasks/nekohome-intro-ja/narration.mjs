// 日文旁白（配音版）+ 中文字幕。**只讲小糯米，不讲工作室**。
//
//   call D:\gptsov\ai-anim环境.bat
//   node scripts/anim.mjs say nekohome-intro-ja --rate +8% --table ja --tts "python tools/tts-gptsovits.py"
//   node scripts/make-ja-zhsub.mjs
//   node scripts/anim.mjs mix nekohome-intro-ja --table ja --target streaming
//
// 文案口径：短句、具体名词、一点点自嘲。不要「XX 的：A，和 B」这种对仗结论句。
export const VOICE = 'cotton-ja';
export const TAIL = 0.5;
export const MAX_STRETCH = 1.3;
export const BPM = 80;
export const OVERLAP = 0;

export const SCENES = [
  { id: 'open', internal: 6.4, lines: [
    { cue: 0.3, text: 'うちの子を、紹介させてください。', zh: '介绍一下我们家这位。' },
    { cue: 3.45, text: 'コードで描いた猫娘です。', zh: '一只用代码画出来的猫娘。' },
  ] },
  { id: 'nuomi', internal: 8.0, lines: [
    { cue: 0.3, text: 'オレンジに白、琥珀の目、首に鈴。', zh: '橘白毛，琥珀眼，脖子上一颗铃铛。' },
    { cue: 5.1, text: 'よく喋って、ちょっとツンデレ。', zh: '话很多，还爱逞强。' },
  ] },
  { id: 'tsundere', internal: 8.0, lines: [
    { cue: 0.3, text: 'なでられたいくせに、逃げる。', zh: '明明想被摸，先躲开。' },
    { cue: 3.6, text: 'で、無視すると、こっそり見てる。', zh: '真不理她，又偷偷盯着你。' },
  ] },
  { id: 'xiaoying', internal: 9.6, lines: [
    { cue: 0.3, text: 'シャオイン。いつも一緒にいる人。', zh: '萧影，总跟她待在一起的那位。' },
    { cue: 4.2, text: '日本語の勉強中。糯米が好き。', zh: '在学日语，最爱抱着糯米。' },
  ] },
  { id: 'phrases', internal: 2.6, lines: [ { cue: 0.2, text: '口ぐせは、隠せません。', zh: '口头禅这种东西，藏不住。' } ] },
  { id: 'end', internal: 3.2, lines: [ { cue: 0.2, text: '以上、うちの子でした。', zh: '我们家这位，就这样。' } ] },
];
