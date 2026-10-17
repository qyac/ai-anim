// hop —— 弧线跳的图册：主体离开当前槽、划一道抛物线落进下一个槽。
//
// 「主体挑起下一个东西」：一个球从左槽跳到右槽，sin(πk) 峰化弧高（端点为零、
// 不在出发/落地瞬间有垂直速度），落地后 spring 回弹挤压 —— hop 只管空中路径，
// 挤压是场景自己的收尾。
import { makeShot, withAlpha } from '../../../src/kit/index.js';
import { hop } from '../../../src/kit/carry.js';
import { spring, css } from '../../../src/core/util.js';

export default makeShot('hop', {
  draw(ctx, { enter }) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const from = [420, 640], to = [1120, 640];
    const h = hop(f.lt, 0.4, 0.8, from, to, { height: 220 });
    // 落地挤压：spring 在 k=1 后开始（0.8s 空中 + 落地 t0=1.2s）
    const landT = 1.2;
    const sq = spring(f.lt - landT, 1, 140, 12);           // 0→1 的回弹
    const squash = h.k >= 1 ? 1 - 0.35 * Math.sin(sq * Math.PI) : 1;
    lines.begin();
    // 两个槽位刻度
    lines.seg(from[0] - 60, from[1] + 40, from[0] + 60, from[1] + 40, 2, withAlpha(P.ash, 0.7));
    lines.seg(to[0] - 60, to[1] + 40, to[0] + 60, to[1] + 40, 2, withAlpha(P.signal, 0.7));
    // 弧线轨迹（虚点）：只画"球已经飞过"的那一段（比较时刻，不是进度）
    for (let i = 0; i <= 40; i++) {
      const tk = i / 40;
      const tPt = 0.4 + tk * 0.8;                  // 轨迹点 i 的时刻
      if (f.lt > tPt && tPt < 1.2) {
        const pt = hop(tPt, 0.4, 0.8, from, to, { height: 220 });
        // 轨迹点画成 2px 的极短线（零长度 seg 画不出来）
        lines.seg(pt.x - 1, pt.y, pt.x + 1, pt.y, 1.2, withAlpha(P.ash, 0.35));
      }
    }
    // 球体（落地时压扁拉伸）
    const r = 34;
    lines.circle(h.x, h.y, Math.max(1, r), 3, P.bone);
    lines.circle(h.x, h.y, Math.max(1, r * (2 - squash) * 0.5), 1.5, withAlpha(P.bone, 0.3));
    lines.flush(ctx.out);

    text.clear();
    type.writeLine('hop', 96, 120, { anchor: 'left', size: 30, family: 'mono', color: css(P.ash), ...enter(0) });
    type.writeLine('弧线跳：sin(πk) 峰化 · 端点零垂直速度', 96, 156, { anchor: 'left', size: 20, family: 'mono', color: css(P.ash), ...enter(0.1) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.12, grain: 0.02 };
  },
});
