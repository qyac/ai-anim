// 运动上限（1-33）的**红证明夹具**：这一段故意写超限的 stagger，另一段写合规的。
//
//   node scripts/anim.mjs check _motion-lab --strict   # 必须报 [运动上限] 这一条
//   node tools/lint-motion-caps.mjs _motion-lab        # 同一判据，直接看读数
//
// 判据口径与 src/kit/motion.js 的 waterfallOver 逐字一致：items × stagger ≤ 0.5s。
// 夹具里两段的字数与 stagger 都是字面量，所以静态扫描**读得出**级联跨度（不是 unchecked）。
import { css, prog } from '../../../src/core/util.js';

/** 九个字：9 × 0.09 = 0.81s，超过 0.5s 上限 */
const OVER_TEXT = '这一行字会超限';
const OVER_STAGGER = 0.09;

/** 九个字：9 × 0.04 = 0.36s，在上限内 */
const OK_TEXT = '这一行字不超限';
const OK_STAGGER = 0.04;

// ⚠ 刻意**不用**函数参数传 stagger：参数会遮蔽 const 表，静态扫描就读不出值了
//（真实场景里那样写会落进 unchecked —— 这也是 lint 该报告的"没验"，不是通过）。
export const over = {
  id: 'over',
  render(ctx) {
    const { f, gl, P, text: layer, type, comp } = ctx;
    gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);
    layer.clear();
    type.write(OVER_TEXT, 200, 520, {
      size: 96, weight: 800, family: 'sans', color: css(P.bone),
      stagger: OVER_STAGGER, staggerDur: 0.45, from: 'up', dist: 60, t: f.lt,
    });
    layer.upload();
    comp.draw(gl, layer, ctx.out, { premult: false });
    return { bloom: 0.3, grain: 0.03 };
  },
};

export const ok = {
  id: 'ok',
  render(ctx) {
    const { f, gl, P, text: layer, type, comp } = ctx;
    gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);
    layer.clear();
    type.write(OK_TEXT, 200, 520, {
      size: 96, weight: 800, family: 'sans', color: css(P.bone),
      stagger: OK_STAGGER, staggerDur: 0.45, from: 'up', dist: 60, t: f.lt,
    });
    layer.upload();
    comp.draw(gl, layer, ctx.out, { premult: false });
    return { bloom: 0.3, grain: 0.03 };
  },
};
