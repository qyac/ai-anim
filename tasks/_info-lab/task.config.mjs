/**
 * infoShot 段落骨架的标定夹具（BACKLOG 1-50）。
 *
 * 3 段：
 *   demo      默认形态：kicker/title/caption/source/foot 全给，draw 只画一根线（最小用户代码）
 *   chartish  draw 里画一组柱（复用 rect 几何），验证"骨架包掉版面、用户只画图"
 *   bare      noFocus + 全部字段留空（验"空串不画"与 focus 豁免路径）
 *
 *   node scripts/anim.mjs check _info-lab
 *   node scripts/anim.mjs still _info-lab -t 2.5,8.5,14.5
 *
 * ⚠ 夹具，不是片子：柱子的高度是示意读数，没有事实表（也不该有）。
 */
import { seq, cut } from '../../src/timeline.js';
import { infoShot, worldPass } from '../../src/kit/index.js';

const demo = infoShot('demo', {
  kicker: 'INFOSHOT / 01',
  title: '一段信息的标准骨架',
  caption: '图形区 · 面板底',
  source: 'anim · kit/info.js',
  foot: '01 / 03',
  draw(ctx, rect) {
    const { lines, P } = ctx;
    lines.begin();
    lines.seg(rect.x + 60, rect.y + rect.h * 0.5, rect.x + rect.w - 60, rect.y + rect.h * 0.5, 3, P.signal);
    lines.circle(rect.x + rect.w / 2, rect.y + rect.h * 0.5, 40, 2, P.bone, 40);
    lines.flush(ctx.out);
  },
});

const chartish = infoShot('chartish', {
  kicker: 'INFOSHOT / 02',
  title: '用户只画图',
  caption: '柱高 · 示意读数',
  source: 'anim · 示意值',
  foot: '02 / 03',
  draw(ctx, rect, k) {
    const { lines, P, text, type, comp, gl } = ctx;
    const vals = [0.35, 0.55, 0.42, 0.78, 0.62];
    const bw = rect.w / (vals.length * 1.6);
    lines.begin();
    vals.forEach((v, i) => {
      const h = rect.h * 0.62 * v * k;
      const x = rect.x + rect.w * ((i + 0.55) / vals.length) - bw / 2;
      lines.fillRect(x, rect.y + rect.h - 60 - h, bw, h,
        [P.ink2[0] * 1.4 + P.bone[0] * 0.18, P.ink2[1] * 1.4 + P.bone[1] * 0.18, P.ink2[2] * 1.4 + P.bone[2] * 0.18, 1], 3);
    });
    lines.seg(rect.x + 40, rect.y + rect.h - 60, rect.x + rect.w - 40, rect.y + rect.h - 60, 2, P.bone);
    lines.flush(ctx.out);
  },
});

const bare = infoShot('bare', {
  noFocus: true,
  draw(ctx, rect) {
    const { lines, P } = ctx;
    lines.begin();
    lines.rect(rect.x, rect.y, rect.w, rect.h, 2, P.graphite);
    lines.flush(ctx.out);
  },
});

export const world = (ctx) => worldPass(ctx, { grid: 60, accent: ctx.P.cyan });

export default {
  title: 'info-lab（infoShot 骨架标定）',
  width: 1920, height: 1080, fps: 60, scale: 1,
  timeline: seq([
    cut(demo, { dur: 6, world: 'auto' }),
    cut(chartish, { dur: 6, world: 'auto' }),
    cut(bare, { dur: 6, world: 'auto' }),
  ]),
};
