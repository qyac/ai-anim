// @ts-check
/**
 * 镜头模板：`timeline` —— **横向事件轴**：一条轴线从左画到右，事件节点被笔尖"路过"时依次弹出（BACKLOG 1-48 收尾批）。
 *
 * 与 `lineart` 的分工：`lineart` 画的是**路径本身**（y 会拐弯，看点是形状）；`timeline` 画的是
 * **顺序**—— 一条直轴 + 上下交替的事件名，观众要读的是"先做什么后做什么"。
 * 与 `morph` 同属"同一组数换布局"这一族：给它的只是一串名字，布局（等距铺开 / 上下交替）由模板管。
 *
 * 动效只有一条时间轴：`axis`（0.4→3.4s）是轴的画出进度，也是每个事件的**揭晓开关**——
 * 笔尖路过某节点 ±40px 内它才弹出（outBack），标签随后淡入。任意 seek 都对。
 *
 * ```js
 * export default shot('timeline', { events: ['立项', '原型', '内测', '发布'] });
 * ```
 */

import { Pass } from '../core/gl.js';
import { css, ease, prog, clamp } from '../core/util.js';
import { resolveTypeSize } from '../style/tokens.js';

/** 全部参数 = "什么都不传时的画面"（文案是中性示意，不是结论）。 */
const DEFAULTS = {
  id: 'timeline',
  kicker: 'TIMELINE / 事件轴',
  title: '先做什么，后做什么',
  events: ['立项', '原型', '内测', '发布'],
  footer: '顺序本身就是信息 —— 轴上的每个节点都是一件事',
};

/**
 * @param {{ id?: string, kicker?: string, title?: string, events?: string[], footer?: string }} [opts]
 * @returns {any} 场景对象
 */
export function timelineShot(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return {
    id: o.id,

    setup(ctx) {
      const P = ctx.P;
      // 整帧背景：墨底 + 很淡的纵向刻度网（像胶片的齿孔带）+ 上方一团极弱冷光
      this.bg = new Pass(ctx.gl, /* glsl */ `
        uniform vec3 ink, ink2, graphite, signal;
        void main() {
          vec2 p = FRAG_PX / RES_LOGICAL;
          vec3 col = mix(ink, ink2, smoothstep(0.0, 1.0, p.y));
          float l = abs(fract(FRAG_PX.x / 120.0) - 0.5) * 2.0;
          float w = fwidth(FRAG_PX.x / 120.0) * 1.5;
          col = mix(col, graphite * 0.5, (1.0 - smoothstep(w, w * 3.0, l)) * 0.05);
          col += signal * exp(-pow((p.y - 0.14) * 3.4, 2.0) - pow((p.x - 0.5) * 2.4, 2.0)) * 0.014;
          col += (hash12(FRAG_PX + fract(t) * 31.0) - 0.5) * 0.010;
          fragColor = vec4(col, 1.0);
        }`, {
        ink: P.ink, ink2: P.ink2, graphite: P.graphite, signal: P.signal,
      }, { key: 'shot_timeline_bg', blend: false });
    },

    render(ctx) {
      const { f, gl, P, text, type, comp, lines, grid } = ctx;
      const { W, H } = gl;
      const t = f.lt;

      this.bg.render(gl, ctx.out, f.t, f.dt);

      const tokens = ctx.style?.tokens ?? {};
      const h2 = resolveTypeSize('h2', tokens) ?? 56;
      const pad = grid?.pad ?? Math.round(W * 0.0625);
      const tagY = grid?.top ?? 92;
      const footerY = grid?.footerY ?? 1018;

      const L = pad + Math.round(W * 0.02);
      const R = W - pad - Math.round(W * 0.02);
      const axisY = Math.round(H * 0.545);
      const events = (Array.isArray(o.events) ? o.events : DEFAULTS.events)
        .map((s) => String(s ?? '')).filter(Boolean);
      const n = Math.max(1, events.length);

      // 轴的画出进度（也是所有事件的揭晓开关）
      const axis = ease.inOutCubic(prog(t, 0.40, 3.40));
      const tipX = L + (R - L) * axis;

      // 事件 x：等距铺开（首尾贴轴的两端；单个事件放中间）
      const xOf = (i) => (n === 1 ? (L + R) / 2 : L + ((R - L) * i) / (n - 1));

      lines.begin();

      // 1) 轴本体：一根骨白主线 + 底下一条极淡的信号色伴线（走过的部分）
      lines.seg(L, axisY, tipX, axisY, 2.5, P.bone);
      lines.seg(L, axisY + 6, tipX, axisY + 6, 1.5,
        [P.signal[0], P.signal[1], P.signal[2], 0.35]);

      // 2) 事件节点：笔尖路过 ±40px 内弹出（outBack 给一点回弹），带一根短刻度与标签引线
      events.forEach((name, i) => {
        const x = xOf(i);
        const near = clamp((tipX - x) / 40 + 1);          // -1..1：路过前淡出、路过后压满
        const pop = ease.outBack(clamp(near));             // 只在 0..1 段起作用
        if (pop <= 0.001) return;
        const up = i % 2 === 0;                            // 上下交替，避免挤成一行
        const tickA = up ? -1 : 1;
        // 短刻度（轴 → 标签方向）
        lines.seg(x, axisY + tickA * 8, x, axisY + tickA * (8 + 26 * pop), 1.5,
          [P.graphite[0] * 1.3, P.graphite[1] * 1.3, P.graphite[2] * 1.3, 0.9]);
        // 节点：外圈 + 中心点
        lines.circle(x, axisY, 11 * pop, 2, P.bone, 24);
        lines.circle(x, axisY, 4.5 * pop, 2, P.signal, 16);
      });

      // 3) 笔尖：轴尽头的信号色光点 + 一小段前驱辉光
      lines.circle(tipX, axisY, 6.5, 2.5, P.signal, 20);
      lines.circle(tipX, axisY, 18, 1, [P.signal[0], P.signal[1], P.signal[2], 0.25], 28);
      lines.flush(ctx.out);

      // 4) 文字：眉标 / 标题 / 每个事件名（跟着节点淡入）/ 页脚
      text.clear();
      type.write(String(o.kicker ?? ''), pad, tagY, {
        size: 22, family: 'mono', tracking: 6, color: css(P.signal, 0.9),
      });
      type.write(String(o.title ?? ''), L, Math.round(H * 0.27), {
        size: h2, weight: 700, family: 'sans', color: css(P.bone),
        stagger: 0.03, staggerDur: 0.5, from: 'up', dist: Math.round(h2 * 0.5), t: t - 0.15,
      });
      events.forEach((name, i) => {
        const x = xOf(i);
        const near = clamp((tipX - x) / 40 + 1);
        if (near <= 0.02) return;
        const up = i % 2 === 0;
        const y = axisY + (up ? -46 : 74);
        // 贴近两端的事件往回收一点，别顶出画面
        const lx = clamp(x, pad + 30, W - pad - 30);
        type.writeLine(name, lx, y, {
          size: 28, weight: 600, family: 'sans', color: css(P.bone, 0.95),
          anchor: 'center', alpha: [0, 1], t: t - 0.4 - i * 0.12,
        });
      });
      type.writeLine(String(o.footer ?? ''), Math.round(W / 2), footerY, {
        size: 24, family: 'mono', color: css(P.ash, 0.85), anchor: 'center',
        alpha: [0, 1], t: t - 1.9,
      });
      text.upload();
      comp.draw(gl, text, ctx.out, { premult: false });

      return {
        bloom: 0.28,
        bloomThreshold: 1.05,
        halation: 0.12,
        grain: 0.030,
        vignette: 0.44,
      };
    },
  };
}

timelineShot.defaults = DEFAULTS;
timelineShot.meta = {
  name: 'timeline',
  summary: '横向事件轴：轴线从左画到右，笔尖路过的事件节点依次弹出（外圈 + 信号色中心点 + 短刻度），事件名上下交替淡入。',
  notes: '背景是自带的整帧 Pass（key `shot_timeline_bg`），不需要时间线的 world。'
    + '`events` 是一串名字，**等距**铺开（首尾贴轴两端）—— 要表达"不等距的时间"，得给每个节点留出视觉间隔，'
    + '那不如用 `lineart`（它吃坐标）。'
    + '节点在笔尖路过 ±40px 内弹出（outBack 回弹），标签随后淡入 —— 段长不足约 3.5 秒会停在半路。'
    + '与 `lineart` 的分工：`lineart` 画**路径形状**（y 会拐弯），`timeline` 画**顺序**（直轴 + 上下交替的名字）。',
  use: '讲顺序 / 步骤 / 阶段 —— 先做什么后做什么',
  energy: '中低',
  avoid: '要表达不等距时间或路径形状（用 lineart）；事件超过 7 个时名字会互相挤',
  params: [
    { name: 'id', type: 'string', desc: '段名（HUD / --only / 报错里用它）' },
    { name: 'kicker', type: 'string', desc: '左上眉标' },
    { name: 'title', type: 'string', desc: '轴上方的主标题（逐字上浮）' },
    { name: 'events', type: 'string[]', desc: '事件名（等距铺开；空数组退回默认四个）' },
    { name: 'footer', type: 'string', desc: '底部一行（页脚带里，最后淡入；空串则不画）' },
  ],
};

/**
 * 声明式 spec（docs/ENGINE.md §14.9）。
 *
 * requires: [] —— 只读 f.lt / P / 参数与自带背景 Pass。
 * outputs.visual = 'full-frame' —— setup() 里的整帧背景 Pass。
 */
timelineShot.spec = {
  params: {
    id: 'string', kicker: 'string', title: 'string', events: 'string[]', footer: 'string',
  },
  requires: [],
  outputs: { visual: 'full-frame', handlesTransition: false },
};
