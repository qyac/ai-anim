/**
 * 像素风标定夹具（BACKLOG 1-67；素材包缺口表第 9 行，覆盖 K28 L49 L51 O77 R5 V13 X13）。
 *
 * 判断标准只有一条：**它看起来像一台老机器算出来的**，而不是"给普通画面加了扫格线"。
 * 四件事缺一件就退化成后者：调色板（4–8 色）/ 块（一切落在同一栅格）/ 有序抖动（不是渐变）
 * / 12fps 的台阶（不是 60fps 平滑）。夹具因此刻意排成四种介质，每个都错开一档：
 *
 *   pixel-default   默认（四阶绿 + 机器人 + 8 格）
 *   pixel-nes       红白机那张 8 色表 + 硬币 + 更细的格子（cell 4：块越小越不像 8-bit）
 *   pixel-bit1      一比特（只有黑白 —— 明暗全靠抖动）+ bitmap 档（最后不做半格压栅格）
 *   pixel-amber     琥珀单色 + 终端档（地平线更高）+ 头骨
 *
 *   node scripts/anim.mjs check _pixel-lab
 *   node scripts/anim.mjs still _pixel-lab -t 2,6,10,14
 *   node scripts/anim.mjs shot  _pixel-lab --from 0 --to 6
 *
 * ⚠ 夹具，不是片子：画面上的数字/读数都是示意，没有事实表（也不该有）。
 */
export default {
  title: 'pixel-lab（像素风标定）',
  width: 1920, height: 1080, fps: 60, scale: 1,
  // ⚠ 段长刻意不等（4 / 6 / 3 / 7）：等长会挂一条「节奏：节拍器」的告警，
  //   而那条告警对**标定夹具**没有意义 —— 但让它一直挂着，别人就分不清
  //   "这是夹具的常态" 与 "这条真的坏了"。
  timeline: [
    { type: 'pixel', dur: 4, world: false, focus: 'center' },

    { type: 'pixel', id: 'pixel-nes', dur: 6, world: false,
      kicker: 'PIXEL / 八色 · cell 4',
      title: '八色小机器',
      sub: '块小一半，像素感就少一半',
      palette: 'nes', cell: 4, crawl: 'coin',
      footer: '颜色越多、块越小 —— 越像"现代的低分辨率滤镜"',
      focus: 'center' },

    { type: 'pixel', id: 'pixel-bit1', dur: 3, world: false,
      kicker: 'PIXEL / 一比特 · bitmap',
      title: '只有黑白',
      sub: '全部明暗都是抖出来的',
      palette: 'bit1', style: 'bitmap', crawl: 'skull',
      footer: '一比特：抖错了整张图就读不出来',
      focus: 'center' },

    { type: 'pixel', id: 'pixel-amber', dur: 7, world: false,
      kicker: 'PIXEL / 琥珀屏 · terminal',
      title: '琥珀终端',
      sub: '只有一种颜色，四个明度',
      palette: 'amber', style: 'terminal', crawl: 'tree',
      footer: '终端档：地平线更高，像一块屏',
      focus: 'center' },
  ],
};
