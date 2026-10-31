// @ts-check
/**
 * 纸艺夹具场景：三层撕边纸（一张底纸 + 一张中间纸 + 一张小卡片）。
 *
 * 判断标准：**它看起来像被剪下来贴上去的纸**，而不是"一堆彩色多边形"。
 * 三条缺一件就退化成后者：硬投影 / 分形撕边 + 白芯 / 纸色有纤维。
 *
 * 三个实测出来的比例（第一版都踩错过，写在下面免得下次再踩）：
 *   · 撕口幅度 = **边长 × 1.5%–3%**（2000px 宽的纸用 12px ⇒ 缩略图里就是一条直线）
 *   · 白芯提亮 = **7%**（第一版 35% ⇒ 一条雪白高光带，读起来像贴纸的白边）
 *   · 三层纸的明度要**拉开 15% 以上**，否则叠起来糊成一片（纸和纸的色差本来就不大，
 *     但画面要读得出层次就得夸张一点；这也是"照片 vs 插画"的差别）
 */
import { paperShape, paperStack, paperGrain } from '../../../src/kit/index.js';
import { css } from '../../../src/core/util.js';

export default {
  id: 'paper',
  focus: 'center',

  setup(ctx) {
    // ⚠ 撕边在 setup 里算一次：纸不会每帧重新撕一遍（也省掉每帧 800 次噪声）
    this.stack = [
      // 最远：整屏底纸（2040px 宽 ⇒ amp 40）
      {
        shape: paperShape({
          x: -60, y: 96, w: 2040, h: 920, seed: 11,
          amp: 40, rough: 14, roughFreq: 14, core: 9, jitter: 16,
        }),
        color: paperGrain([0.52, 0.45, 0.36], 0, 0, { seed: 1 }),
        depth: 0,
      },
      // 中间
      {
        shape: paperShape({
          x: 210, y: 300, w: 1500, h: 560, seed: 23,
          amp: 30, rough: 11, roughFreq: 16, core: 8, jitter: 13,
        }),
        color: paperGrain([0.78, 0.71, 0.60], 200, 300, { seed: 2 }),
        depth: 0.55,
      },
      // 最近：小卡片
      {
        shape: paperShape({
          x: 560, y: 450, w: 620, h: 260, seed: 37,
          amp: 14, rough: 6, roughFreq: 18, core: 6, jitter: 8,
        }),
        color: paperGrain([0.97, 0.94, 0.88], 420, 470, { seed: 3 }),
        depth: 1,
      },
    ];
  },

  render(ctx) {
    const { f, gl, lines, text, type, comp } = ctx;
    // 桌面：比最深的纸更深，纸才有"放在桌上"的对比
    gl.clear(ctx.out, [0.09, 0.13, 0.16]);

    // pan 必须是 t 的函数（引擎铁律）；视差由 paperStack 按 depth 铺开
    const pan = [Math.sin(f.t * 0.35) * 26, Math.cos(f.t * 0.27) * 14];
    lines.begin();
    // step 2：撕边上的小尺度毛刺在行距 3 下会被抹平
    paperStack(lines, this.stack, { pan, parallax: 54, step: 2, shadowDist: 30, shadowAmount: 0.30 });
    lines.flush(ctx.out);

    text.clear();
    type.writeLine('剪纸 / 纸艺层叠', 960, 300, {
      anchor: 'center', size: 'h1', color: css([0.12, 0.09, 0.06]),
    });
    type.writeLine('硬投影 · 分形撕边 + 白芯 · 纸色纤维', 840, 580, {
      anchor: 'center', size: 'body', color: css([0.22, 0.17, 0.12]),
    });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });

    return { bloom: 0.08, grain: 0.02, vignette: 0.34 };
  },
};
