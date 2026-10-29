// @ts-check
/**
 * 镜头模板：`liquid` —— **液体动态**：域扭曲的流体底 + 一圈圈落下的液滴涟漪。
 *
 * 底用的是引擎原语 `src/kit/liquid.js`（域扭曲 fbm），所以它和 `mg-liquid` / `mg-aurora`
 * 这些风格是同一套东西：换参数就换气质，不用重写 shader。
 *
 * 涟漪是**同心圆按时间外扩**（`ripple(t - birth)`），不是粒子系统 —— 仍然是 t 的纯函数。
 *
 * ```js
 * export default shot('liquid', { title: '一滴就够了', drops: 3 });
 * ```
 */

import { css, prog, sat, mixColor } from '../core/util.js';
import { liquidPass } from '../kit/liquid.js';
import { resolveTypeSize } from '../style/tokens.js';

const DEFAULTS = {
  id: 'liquid',
  kicker: 'LIQUID / 一滴就够了',
  title: '一滴就够了',
  sub: '域扭曲的流体底 · 同心圆涟漪',
  drops: 3,
  footer: '底是 fbm 域扭曲；涟漪是 ripple(t - birth) —— 全程 t 的纯函数',
};

export function liquidShot(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return {
    id: o.id,
    setup(ctx) {
      this.bg = liquidPass(ctx, { scale: 2.3, speed: 0.07, warp: 0.62 });
      // 液滴落点与出生时刻：确定性（不随机），错峰落
      this.dropsAt = [];
      const n = Math.max(1, Math.round(o.drops));
      for (let i = 0; i < n; i++) {
        this.dropsAt.push({
          x: 0.30 + 0.20 * i,
          y: 0.62 - 0.06 * i,
          birth: 0.45 + i * 0.85,
        });
      }
    },

    render(ctx) {
      const { f, gl, P: Q, lines, text, type, comp, W, H } = ctx;
      const t = f.lt;
      this.bg.render(gl, ctx.out, t, f.dt);

      const sig = Q.signal;
      const bone = Q.bone;
      lines.begin();
      // 涟漪：每个液滴出生后持续外扩（速度衰减），最多 4 圈
      for (const d of this.dropsAt) {
        const age = t - d.birth;
        if (age <= 0) continue;
        for (let k = 0; k < 4; k++) {
          const a = age - k * 0.42;
          if (a <= 0) continue;
          const r = 26 + a * 210 * Math.pow(0.62, k);
          const alpha = Math.max(0, 0.34 - a * 0.16) * Math.pow(0.7, k);
          if (alpha <= 0.004) continue;
          lines.circle(W * d.x, H * d.y, r, 2.4, [sig[0], sig[1], sig[2], alpha], 72);
        }
        // 液滴本体：落下 → 触底摊开（一个压扁的椭圆，用两段弧代替）
        const fall = sat(prog(t, d.birth - 0.5, d.birth));
        if (fall > 0 && fall < 1) {
          const y = H * d.y - (1 - fall) * H * 0.5;
          lines.circle(W * d.x, y, 7 + 3 * fall, 2.6, [bone[0], bone[1], bone[2], 0.9], 24);
        }
      }
      // 一条水平基线（液面）
      const lv = H * 0.795;
      lines.seg(W * 0.08, lv, W * 0.92, lv, 2, [bone[0], bone[1], bone[2], 0.12]);
      lines.flush(ctx.out);

      text.clear();
      const hero = resolveTypeSize('hero', ctx.style?.tokens ?? null) ?? 132;
      type.write(o.kicker, W * 0.08, H * 0.14, { size: 22, weight: 700, family: 'mono', color: css(Q.ash), t: t - 0.15 });
      type.write(o.title, W * 0.08, H * 0.30, { size: Math.round(hero * 0.8), weight: 800, family: 'sans', color: css(mixColor(bone, [1, 1, 1], 0.25)), t: t - 0.35, stagger: 0.04, from: 'up', dist: 24 });
      type.write(o.sub, W * 0.08, H * 0.30 + Math.round(hero * 0.8) * 0.75, { size: 26, weight: 500, family: 'mono', color: css(Q.ash), t: t - 0.6 });
      // 深底上 graphite 几乎看不见（实测），页脚用 ash 并压到 0.55 兜住",
      type.write(o.footer, W * 0.08, H - 62, { size: 19, weight: 500, family: 'mono', color: css(Q.ash), alpha: [0, 0.55], t: t - 0.9 });
      text.upload();
      comp.draw(gl, text, ctx.out, { premult: false });
      return { bloom: 0.55, halation: 0.35, grain: 0.012 };
    },
  };
}

liquidShot.defaults = DEFAULTS;
liquidShot.meta = {
  label: '液体动态',
  note: '域扭曲 fbm 流体底 + 同心圆涟漪（ripple(t - birth)），全程 t 的纯函数。',
  energy: '中',
  use: '一滴/一次触碰引发的扩散；抽象的品牌收尾',
  avoid: '需要看清单根线条的图（域扭曲会把细节搅糊）',
  params: [
    { name: 'id', type: 'string', desc: '段名' },
    { name: 'kicker', type: 'string', desc: '左上眉标' },
    { name: 'title', type: 'string', desc: '主标题' },
    { name: 'sub', type: 'string', desc: '副标' },
    { name: 'drops', type: 'number', desc: '液滴数（1..4）' },
    { name: 'footer', type: 'string', desc: '底部一行' },
  ],
};

liquidShot.spec = {
  params: { id: 'string', kicker: 'string', title: 'string', sub: 'string', drops: 'number', footer: 'string' },
  requires: [],
  outputs: { visual: 'full-frame', handlesTransition: false },
};
