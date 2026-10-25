// @ts-check
/**
 * `_flat-lab` —— **flat 风格（无母题背景）的验证夹具**（BACKLOG 1-46）。
 *
 * 为什么不能拿 `_style-sampler` 验：它的时间线全是 `src/shots/` 模板，而模板**自带整帧背景**
 * （`chart.js` 自带纸面 Pass、`title.js` 自带网格 Pass），风格的 `motif` 根本够不着它们。
 * 这里用一个 `makeShot` 手写场景 + `world: 'auto'`：背景由引擎按风格铺，才能看出
 * "style: 'flat' → 纯色摄影棚"这件事。
 */
import { seq, cut } from '../../src/timeline.js';
import { makeShot, worldPass } from '../../src/kit/index.js';
import { css } from '../../src/core/util.js';

export const world = (ctx) => worldPass(ctx, { motif: 'auto' });   // 跟着 ctx.style.motif 走

const hero = makeShot('hero', {
  draw(ctx) {
    const { f, text, type, P, comp, gl } = ctx;
    text.clear();
    type.writeLine('纯色摄影棚', 960, 430, { anchor: 'center', size: 136, weight: 800, family: 'sans', color: css(P.bone) });
    type.writeLine('FLAT · 没有背景母题的一屏', 960, 520, { anchor: 'center', size: 40, family: 'mono', color: css(P.ash) });
    type.writeLine('颗粒 + 暗角就是全部"质感"', 960, 580, { anchor: 'center', size: 26, family: 'mono', color: css(P.ash) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.3, grain: 0.03 };
  },
});

export default {
  title: 'flat 风格验证', style: 'flat', width: 1920, height: 1080, fps: 60,
  timeline: seq([cut(hero, { dur: 4, world: 'auto' })]),
};
