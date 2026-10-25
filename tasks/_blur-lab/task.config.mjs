// 1-41 的目视夹具：同一个标题模板，只差一个 `blur` 参数 —— 看"从虚焦里浮出来"到底成不成立。
//
//   node scripts/anim.mjs still _blur-lab -t 1.0,4.1,4.5,5.6,7.4   # 三段各取关键时刻
//   node scripts/anim.mjs still _blur-lab -t 4.1 --only soft
//
// 判据（人工目检，两张图并排看）：
//   · sharp 段：字从下方 70px 上浮到位，**边缘始终锋利**；
//   · soft  段：同样的上浮，但每个字还带 20px → 0 的虚焦；落定后与 sharp 完全一样。
// 只看"落定帧"是看不出差别的（都收干净了），必须看入场中段（段内 t≈0.6–1.4）。
//
// 三段长度故意不同（3.2 / 4.2 / 1.8）：这支夹具要进 `check` 的节奏腿，
// 等长的段会被判"节拍器"（CoV < 0.25）—— 那对夹具是噪声。
//
// 这个任务只有配置文件、没有 scenes/（B 档），也没有音频 —— 纯确定性，出图不需要音乐。
export default {
  title: 'blur 通道标定',
  width: 1920,
  height: 1080,
  fps: 60,
  scale: 1,
  timeline: [
    {
      type: 'title',
      id: 'sharp',
      dur: 3.2,
      eyebrow: '1-41 / BLUR OFF',
      title: '从清晰到清晰',
      sub: 'blur: 0 —— 完全不碰 Canvas2D 的 filter',
      blur: 0,
    },
    {
      type: 'title',
      id: 'soft',
      dur: 4.2,
      eyebrow: '1-41 / BLUR 20px',
      title: '从虚焦里浮出来',
      sub: 'blur: 20 —— 与上浮共用同一条缓动',
      blur: 20,
    },
    {
      type: 'title',
      id: 'settled',
      dur: 1.8,
      eyebrow: '1-41 / 落定之后',
      title: '两者一样',
      sub: 'blur 只作用于入场过程，落定帧不留任何滤镜',
      blur: 20,
    },
  ],
};
