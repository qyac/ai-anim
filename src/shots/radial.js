// @ts-check
/**
 * 镜头模板：`radial` —— **径向分布**：一个中心 + 一圈轮辐（每个节点一根辐条、一个名字、可选一个读数条）（BACKLOG 1-48 收尾批）。
 *
 * 为什么需要它：`chart` / `compare` 都是**笛卡尔**的（比高低、比长短），讲"几个部分围绕一个中心"
 * （构成 / 多路输入 / 环节闭环）时，手写要自己算一圈三角函数与文字对齐；模板把它固定下来：
 *   · 节点**均匀分布**在圆上（角度 = 起点 + i·360/n，逆时针）；
 *   · 名字**背向圆心**排（外圈），读数条沿辐条方向画（内圈）—— 文字与图形各占一环，不互相压；
 *   · 中心是一个核（呼吸的方块 + 一圈慢转的环），让"围绕"有一个可见的锚。
 *
 * 全部动效是一条时间轴：辐条按序弹出（每根 delay 0.09s、outBack）、环慢转（t 的纯函数）。
 *
 * ```js
 * export default shot('radial', { nodes: ['采集', '清洗', '建模', '校验', '发布'] });
 * ```
 */


import { contentOk, atMost } from './pick.js';
import { Pass } from '../core/gl.js';
import { css, ease, prog, clamp, TAU } from '../core/util.js';
import { resolveTypeSize } from '../style/tokens.js';

/** 全部参数 = "什么都不传时的画面"（读数条是示意值，不是结论）。 */
const DEFAULTS = {
  id: 'radial',
  kicker: 'RADIAL / 环形分布',
  title: '围绕一个中心的五条线',
  nodes: ['采集', '清洗', '建模', '校验', '发布'],
  weights: [0.62, 0.45, 0.88, 0.54, 0.71],
  footer: '中心是目标，辐条是各路的进度',
};

/**
 * @param {{ id?: string, kicker?: string, title?: string, nodes?: string[],
 *           weights?: number[], footer?: string }} [opts]
 * @returns {any} 场景对象
 */
export function radialShot(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return {
    id: o.id,

    setup(ctx) {
      const P = ctx.P;
      // 整帧背景：墨底 + 一层极淡的同心环（呼应"径向"）+ 中心一团弱光
      this.bg = new Pass(ctx.gl, /* glsl */ `
        uniform vec3 ink, ink2, graphite, signal;
        uniform float cx, cy;
        void main() {
          vec2 p = FRAG_PX / RES_LOGICAL;
          vec3 col = mix(ink, ink2, smoothstep(0.0, 1.0, p.y));
          vec2 q = FRAG_PX - vec2(cx, RES_LOGICAL.y - cy);
          float r = length(q);
          float ring = abs(fract(r / 90.0) - 0.5) * 2.0;
          float w = fwidth(r) * 1.5;
          col = mix(col, graphite * 0.5, (1.0 - smoothstep(w, w * 3.0, ring)) * 0.06);
          col += signal * exp(-r * r * 2.6e-6) * 0.016;
          col += (hash12(FRAG_PX + fract(t) * 37.0) - 0.5) * 0.010;
          fragColor = vec4(col, 1.0);
        }`, {
        ink: P.ink, ink2: P.ink2, graphite: P.graphite, signal: P.signal,
        cx: 960, cy: 540,
      }, { key: 'shot_radial_bg', blend: false });
    },

    render(ctx) {
      const { f, gl, P, text, type, comp, lines, grid } = ctx;
      const { W, H } = gl;
      const t = f.lt;

      const cx = W * 0.5;
      const cy = H * 0.55;
      this.bg.set({ cx, cy }).render(gl, ctx.out, f.t, f.dt);

      const tokens = ctx.style?.tokens ?? {};
      const h2 = resolveTypeSize('h2', tokens) ?? 56;
      const pad = grid?.pad ?? Math.round(W * 0.0625);
      const tagY = grid?.top ?? 92;
      const footerY = grid?.footerY ?? 1018;

      const names = (Array.isArray(o.nodes) ? o.nodes : DEFAULTS.nodes)
        .map((s) => String(s ?? '')).filter(Boolean);
      const n = Math.max(1, names.length);
      const ws = Array.isArray(o.weights) ? o.weights : DEFAULTS.weights;
      const wOf = (i) => clamp(Number(ws[i % ws.length]) || 0, 0, 1);

      const R = Math.min(W * 0.30, H * 0.36);         // 辐条外端
      const Ri = R * 0.56;                            // 辐条内端（离核留一段空）
      const labelR = R + 40;                          // 名字那环（离节点近一点：版面守门按间距聚类，太散会被数成多个"看的地方"）
      const start = -Math.PI / 2 + 0.28;              // 12 点略偏右起步

      lines.begin();

      // 1) 外圈参考环：完整一圈 + 一圈慢转的缺口环（t 的纯函数；转的是环，不是节点——节点位置固定）
      const spin = (t * 0.22) % TAU;
      const segs = 96;
      for (let i = 0; i < segs; i++) {
        const a0 = (TAU * i) / segs;
        // 缺口 = 直接不画那一段（画透明线会白白占批次）
        if (((a0 - spin + TAU) % TAU) < TAU * 0.18) continue;
        const a1 = (TAU * (i + 0.92)) / segs;
        lines.seg(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R,
          cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, 1.2,
          [P.bone[0] * 0.35, P.bone[1] * 0.35, P.bone[2] * 0.35, 0.8]);
      }

      // 2) 辐条 + 读数条 + 节点：逐根弹出（i·0.09s 延迟，outBack）
      names.forEach((name, i) => {
        const a = start - (TAU * i) / n;             // 逆时针
        const dx = Math.cos(a), dy = Math.sin(a);
        const p = ease.outBack(prog(t, 0.35 + i * 0.09, 1.05 + i * 0.09));
        if (p <= 0.001) return;
        const ix = cx + dx * Ri * p;
        const iy = cy + dy * Ri * p;
        const ox = cx + dx * R * p;
        const oy = cy + dy * R * p;
        // 辐条
        lines.seg(ix, iy, ox, oy, 2, [P.bone[0], P.bone[1], P.bone[2], 0.85]);
        // 读数条：沿辐条方向、从辐条内端向圆心方向铺（长度 = weight）
        const w = wOf(i);
        const bx = cx + dx * (Ri - 26 - 120 * w * p);
        const by = cy + dy * (Ri - 26 - 120 * w * p);
        if (w > 0.01) {
          lines.seg(bx, by, ix, iy, 5, P.signal);
        }
        // 节点：外圈 + 实心点
        lines.circle(ox, oy, 10 * p, 2, P.bone, 20);
        lines.circle(ox, oy, 4 * p, 2, P.signal, 14);
      });

      // 3) 中心核：一个呼吸的方块 + 一圈很近的细环（让"围绕"有锚）
      const breath = 1 + 0.06 * Math.sin(t * 1.8);
      const coreS = 17 * breath;
      lines.rect(cx - coreS, cy - coreS, coreS * 2, coreS * 2, 2, P.bone);
      lines.circle(cx, cy, coreS + 12, 1, [P.graphite[0], P.graphite[1], P.graphite[2], 0.8], 28);
      lines.flush(ctx.out);

      // 4) 文字：眉标 / 标题 / 每个节点名（背向圆心排）/ 页脚
      text.clear();
      type.write(String(o.kicker ?? ''), pad, tagY, {
        size: 22, family: 'mono', tracking: 6, color: css(P.signal, 0.9),
      });
      type.write(String(o.title ?? ''), Math.round(W * 0.5), Math.round(H * 0.115), {
        size: h2, weight: 700, family: 'sans', color: css(P.bone), align: 'center',
        stagger: 0.03, staggerDur: 0.5, from: 'up', dist: Math.round(h2 * 0.5), t: t - 0.15,
      });
      names.forEach((name, i) => {
        const a = start - (TAU * i) / n;
        const p = ease.outBack(prog(t, 0.35 + i * 0.09, 1.05 + i * 0.09));
        if (p <= 0.05) return;
        const lx = cx + Math.cos(a) * labelR;
        const ly = cy + Math.sin(a) * labelR;
        // 上下半圆分别压基线：上半文字底部对齐、下半顶部对齐，名字就不会骑在环上
        const above = ly < cy;
        type.writeLine(name, lx, ly + (above ? -6 : 22), {
          size: 26, weight: 600, family: 'sans', color: css(P.bone, 0.95),
          anchor: 'center', alpha: [0, 1], t: t - 0.45 - i * 0.09,
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
        vignette: 0.42,
      };
    },
  };
}

radialShot.defaults = DEFAULTS;
radialShot.meta = {
  name: 'radial',
  summary: '径向分布：中心一个核（呼吸方块）+ 一圈轮辐，每根辐条带节点、名字（外环背向圆心）与沿辐条的读数条；外圈还有一道慢转的缺口环。',
  notes: '背景是自带的整帧 Pass（key `shot_radial_bg`），不需要时间线的 world。'
    + '`nodes` 与 `weights` **按下标配对**（weights 不够长就循环取）；读数条是示意值，'
    + '要有出处（docs/FACTS-TEMPLATE.md ★）。'
    + '节点**均匀分布**（角度 = 起点 - i·360/n，逆时针）—— 要不等距就手写场景。'
    + '慢转的环是 t 的纯函数；节点位置永远固定，转的只是背景环。',
  use: '讲"几个部分围绕一个中心"：构成 / 多路输入 / 环节闭环',
  energy: '中低',
  avoid: '要比高低长短（用 chart / compare）；节点超过 8 个时名字环会互相挤',
  params: [
    { name: 'id', type: 'string', desc: '段名（HUD / --only / 报错里用它）' },
    { name: 'kicker', type: 'string', desc: '左上眉标' },
    { name: 'title', type: 'string', desc: '顶部居中的主标题（逐字上浮）' },
    { name: 'nodes', type: 'string[]', desc: '节点名（等角分布在圆上；空数组退回默认五个）' },
    { name: 'weights', type: 'number[]', desc: '每个节点的读数条长度（0..1，与 nodes 按下标配对；缺省循环取）' },
    { name: 'footer', type: 'string', desc: '底部一行（页脚带里，最后淡入；空串则不画）' },
  ],
};

/**
 * 声明式 spec（docs/ENGINE.md §14.9）。
 *
 * requires: [] —— 只读 f.lt / P / 参数与自带背景 Pass。
 * outputs.visual = 'full-frame' —— setup() 里的整帧背景 Pass。
 */
radialShot.spec = {
  params: {
    id: 'string', kicker: 'string', title: 'string', nodes: 'string[]',
    weights: 'number[]', footer: 'string',
  },
  requires: [],
  outputs: { visual: 'full-frame', handlesTransition: false },
};

/* 选型元数据（BACKLOG 1-62）：tags / w / fits 的契约在 ./pick.js 头注释；brief 缺省字段 = 不设限。
   改这里不改模板画面，只改 anim shots --pick 会抽到谁。 */
radialShot.tags = ['data', 'structure'];
radialShot.w = 0.7;
radialShot.fits = (q) => contentOk(q) && atMost(q?.points, 8);
radialShot.fitsNote = '≤8 个节点（points）；收尾位/转场位抽不到';
