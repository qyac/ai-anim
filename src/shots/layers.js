// @ts-check
/**
 * 镜头模板：`layers` —— **分层纸片**：几张带透视的纸页从后往前落位，每张有自己的横线与索引标记（BACKLOG 1-48 第二批）。
 *
 * 讲"分层 / 抽象层级 / 叠加的几层"时，手写这个形状要重算一套透视与填充；这里把它固定成一张模板：
 *   · 每张纸是**梯形**（上边窄、下边宽），从后往前叠 —— 先画的在最下面（画家算法，线段批没有 z-test）；
 *   · 纸是**实心**的（不透明 `mixColor` 调出来的"纸色"），上面几道横线当"字"；
 *   · 每张纸左边一条信号色小标记，落位顺序决定观众的阅读顺序。
 *
 * ⚠ 纸页的填充是"一行一行横线铺出来"的梯形填充（`fillTrap`），而不是 `fillRect`：
 *   线段批的柔边在相邻两条之间会叠加（见 HANDOFF §11.2），所以填充一律用**不透明**色。
 *
 * ```js
 * export default shot('layers', { sheets: 4, title: '一层一层往回退' });
 * ```
 */


import { contentOk, atMost } from './pick.js';
import { Pass } from '../core/gl.js';
import { css, ease, prog, clamp, mixColor } from '../core/util.js';
import { resolveTypeSize } from '../style/tokens.js';

/** 全部参数 = "什么都不传时的画面"。 */
const DEFAULTS = {
  id: 'layers',
  kicker: 'LAYERS / 分层',
  sheets: 4,
  title: '一层一层往回退',
  footer: '每层只回答一个问题 —— 叠起来才是全貌',
};

/** 梯形填充：`xl(k)` / `xr(k)` 给 k∈[0,1]（上→下）处的左右边界。 */
function fillTrap(lines, xl, xr, top, bot, color, step = 3) {
  const n = Math.max(1, Math.ceil((bot - top) / step));
  const dy = (bot - top) / n;
  for (let i = 0; i < n; i++) {
    const y = top + i * dy + dy * 0.5;
    const k = (y - top) / (bot - top || 1e-9);
    lines.seg(xl(k), y, xr(k), y, dy + 0.6, color);
  }
}

/**
 * @param {{ id?: string, kicker?: string, sheets?: number, title?: string, footer?: string }} [opts]
 * @returns {any} 场景对象
 */
export function layersShot(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return {
    id: o.id,

    setup(ctx) {
      const P = ctx.P;
      // 整帧背景：墨底 + 一圈很弱的中心光（让"纸堆"像被一盏顶灯照着）
      this.bg = new Pass(ctx.gl, /* glsl */ `
        uniform vec3 ink, ink2, graphite, signal;
        void main() {
          vec2 p = FRAG_PX / RES_LOGICAL;
          vec3 col = mix(ink, ink2, smoothstep(0.0, 1.0, p.y));
          float g = exp(-pow((p.x - 0.5) * 1.9, 2.0) - pow((p.y - 0.56) * 2.2, 2.0));
          col += signal * g * 0.018;
          float l = abs(fract(FRAG_PX.y / 6.0) - 0.5) * 2.0;
          float w = fwidth(FRAG_PX.y / 6.0) * 1.5;
          col = mix(col, graphite * 0.35, (1.0 - smoothstep(w, w * 3.0, l)) * 0.05);
          col += (hash12(FRAG_PX + fract(t) * 33.0) - 0.5) * 0.010;
          fragColor = vec4(col, 1.0);
        }`, {
        ink: P.ink, ink2: P.ink2, graphite: P.graphite, signal: P.signal,
      }, { key: 'shot_layers_bg', blend: false });
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

      const n = Math.round(clamp(Number(o.sheets) || 4, 1, 6));
      const cx = W * 0.5;
      const baseY = Math.round(H * 0.63);
      const wdB = Math.min(W * 0.50, H * 0.86);        // 底边宽
      const wdT = wdB * 0.80;                          // 顶边宽（透视）
      const hd = Math.min(H * 0.30, W * 0.22);         // 一张纸的高度
      const offY = Math.round(hd * 0.26);              // 每层往上退多少
      const offX = Math.round(wdB * 0.022);

      // 从后往前画：i = n-1 最远（先画），i = 0 最前
      for (let i = n - 1; i >= 0; i--) {
        const p = ease.outCubic(prog(t, 0.20 + i * 0.14, 1.05 + i * 0.14));
        if (p <= 0.001) continue;
        const drop = (1 - p) * 90;                     // 从下往上落位
        const yBot = baseY - offY * i + drop;
        const yTop = yBot - hd;
        const shift = offX * i;
        const xl = (k) => cx - (wdT * 0.5 + (wdB - wdT) * 0.5 * k) + shift;
        const xr = (k) => cx + (wdT * 0.5 + (wdB - wdT) * 0.5 * k) + shift;
        // 纸身（越远越暗：靠"叠起来的影"表达深度）
        const depth = 1 - i / Math.max(1, n);
        const paper = mixColor(P.ink2, P.bone, 0.024 + 0.034 * depth);
        fillTrap(lines, xl, xr, yTop, yBot, [paper[0], paper[1], paper[2], 1], 3);
        // 横线（"字"）+ 轮廓：只铺在标题下面那半页（上半页留给最前面那张纸的标题）
        const rows = 3;
        for (let r = 0; r < rows; r++) {
          const k = 0.55 + 0.10 * r;
          const y = yTop + (yBot - yTop) * k;
          const inset = 0.06;
          lines.seg(xl(k) + (xr(k) - xl(k)) * inset, y,
            xr(k) - (xr(k) - xl(k)) * (inset + 0.12 * (r % 2 ? 0.4 : 1)), y, 2.2,
            [P.bone[0], P.bone[1], P.bone[2], 0.16 + 0.06 * depth]);
        }
        const ec = [P.graphite[0] * 1.4, P.graphite[1] * 1.4, P.graphite[2] * 1.4, 0.75];
        lines.seg(xl(0), yTop, xr(0), yTop, 1.5, ec);
        lines.seg(xl(1), yBot, xr(1), yBot, 1.5, ec);
        lines.seg(xl(0), yTop, xl(1), yBot, 1.5, ec);
        lines.seg(xr(0), yTop, xr(1), yBot, 1.5, ec);
        // 左边缘的信号色标记（落位顺序 = 阅读顺序）
        const mk = ease.outCubic(prog(t, 0.55 + i * 0.14, 1.15 + i * 0.14));
        if (mk > 0.01) {
          lines.seg(xl(0.34) - 14, yTop + (yBot - yTop) * 0.34,
            xl(0.34) - 14, yTop + (yBot - yTop) * 0.34 + 26 * mk, 3, P.signal);
        }
      }
      lines.flush(ctx.out);

      // 文字：眉标 + 最前面那张纸上的标题 + 页脚
      text.clear();
      type.write(String(o.kicker ?? ''), pad, tagY, {
        size: 22, family: 'mono', tracking: 6, color: css(P.signal, 0.9),
      });
      const frontTop = baseY - hd;
      type.write(String(o.title ?? ''), Math.round(cx), Math.round(frontTop + hd * 0.34), {
        size: h2, weight: 700, family: 'sans', color: css(P.bone), align: 'center',
        stagger: 0.035, staggerDur: 0.55, from: 'up', dist: Math.round(h2 * 0.5),
        t: t - 1.05,
      });
      type.writeLine(String(o.footer ?? ''), Math.round(W / 2), footerY, {
        size: 24, family: 'mono', color: css(P.ash, 0.85), anchor: 'center',
        alpha: [0, 1], t: t - 1.9,
      });
      text.upload();
      comp.draw(gl, text, ctx.out, { premult: false });

      return {
        bloom: 0.26,
        bloomThreshold: 1.1,
        halation: 0.10,
        grain: 0.030,
        vignette: 0.44,
      };
    },
  };
}

layersShot.defaults = DEFAULTS;
layersShot.meta = {
  name: 'layers',
  summary: '分层纸片：几张带透视的梯形纸页从后往前落位，每张有横线与左侧信号色标记，最前面那张上写着标题。',
  notes: '背景是自带的整帧 Pass（key `shot_layers_bg`），不需要时间线的 world。'
    + '`sheets` 是层数（1..6）：越多越密，超过 5 层时最远的几张几乎只剩一条边。'
    + '纸页是**实心**的（不透明调色），填充用梯形逐行铺（`fillTrap`），不是 `fillRect` —— '
    + '线段批的柔边在相邻两条之间会叠加（HANDOFF §11.2）。'
    + '线段批没有 z-test：叠放顺序就是绘制顺序（从远到近，画家算法）。',
  use: '讲"分层 / 抽象层级 / 叠加的几层" —— 一层一层往回退',
  energy: '中低',
  avoid: '需要看清每层内容时（模板只画横线示意）；层数超过 5 层',
  params: [
    { name: 'id', type: 'string', desc: '段名（HUD / --only / 报错里用它）' },
    { name: 'kicker', type: 'string', desc: '左上眉标' },
    { name: 'sheets', type: 'number', desc: '层数（1..6）' },
    { name: 'title', type: 'string', desc: '最前面那张纸上的标题（居中、逐字上浮）' },
    { name: 'footer', type: 'string', desc: '底部一行（页脚带里，最后淡入；空串则不画）' },
  ],
};

/**
 * 声明式 spec（docs/ENGINE.md §14.9）。
 *
 * requires: [] —— 只读 f.lt / P / 参数与自带背景 Pass。
 * outputs.visual = 'full-frame' —— setup() 里的整帧背景 Pass。
 */
layersShot.spec = {
  params: {
    id: 'string', kicker: 'string', sheets: 'number', title: 'string', footer: 'string',
  },
  requires: [],
  outputs: { visual: 'full-frame', handlesTransition: false },
};

/* 选型元数据（BACKLOG 1-62）：tags / w / fits 的契约在 ./pick.js 头注释；brief 缺省字段 = 不设限。
   改这里不改模板画面，只改 anim shots --pick 会抽到谁。 */
layersShot.tags = ['structure', 'editorial'];
layersShot.w = 0.6;
layersShot.fits = (q) => contentOk(q) && atMost(q?.points, 5);
layersShot.fitsNote = '≤5 层（用 points 传层数）；收尾位/转场位抽不到';
