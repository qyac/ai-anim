/**
 * 镜头库第二批新模板的标定夹具（BACKLOG 1-48 第一批：bigtype / scan / device / lineart）。
 *
 * 前 4 段 = 四个模板的**默认画面**（什么都不传，看模板本色）；
 * 后 4 段 = 每个模板**不是默认值**的那几条分支 —— 没跑过 = 没验过：
 *   bigtype-mark   高亮词在第一行（默认那一行的 mark 找不到时整行同色）+ footer 空串
 *   scan-dense     列多行少（40×6）+ label 空串（读数只剩百分比）
 *   device-1row    只给一行内容 + chrome 空串（标题栏只剩三个点）
 *   lineart-few    三个节点 + 两个标签（节点数多于标签：多出来的不标名字）
 *
 * 它只有 task.config.mjs（B 档配置档），没有 scenes/ —— 这正是配置档要证明的事：
 * 新模板加进 src/shots/ 之后，时间线里写个 type 就能用。
 *
 *   node scripts/anim.mjs check _shots2-lab
 *   node scripts/anim.mjs still _shots2-lab -t 3,9,15,21,27,33,39,45
 *
 * ⚠ 这是一支夹具，不是片子：画面上的文案是模板的默认示范句，**没有事实表**（也不该有）。
 *   画面里的百分比读数是"这一段自己的进度"，不是外部数据。
 */
export default {
  title: 'shots2-lab（第二批模板标定）',
  width: 1920, height: 1080, fps: 60, scale: 1,
  // 不写 style ⇒ 默认 'print'（引擎从前的默认观感），这样看到的是模板本色。
  // 想验证风格包下的样子：node scripts/anim.mjs still _shots2-lab -t 3 --style paper
  timeline: [
    { type: 'bigtype', dur: 6, world: false },
    { type: 'scan', dur: 6, world: false },
    { type: 'device', dur: 6, world: false },
    { type: 'lineart', dur: 6, world: false },

    { type: 'bigtype', id: 'bigtype-mark', dur: 6, world: false,
      kicker: 'BIG TYPE / 高亮在第一行',
      line1: '先让观众读到一句',
      line2: '再让画面动起来',
      mark: '一句',
      footer: '' },

    { type: 'scan', id: 'scan-dense', dur: 6, world: false,
      kicker: 'SCAN / 40 × 6',
      cols: 40, rows: 6, label: '',
      footer: '列多行少：读数只剩百分比' },

    { type: 'device', id: 'device-1row', dur: 6, world: false,
      kicker: 'DEVICE / 单行',
      chrome: '',
      title: '只画一行内容',
      rows: [0.92],
      footer: 'chrome 空串 ⇒ 标题栏只剩三个点' },

    { type: 'lineart', id: 'lineart-few', dur: 6, world: false,
      kicker: 'LINEART / 三节点',
      points: [0.06, 0.74, 0.50, 0.40, 0.94, 0.62],
      labels: '起|承',
      footer: '节点多于标签：多出来的不标名字' },
  ],
};
