// @ts-check
/**
 * 镜头模板：`morph` —— **图表形变**：同一组数据先当柱子立起来，再收成一条折线，最后铺成排线面积（BACKLOG 1-48 第二批）。
 *
 * 为什么不是又一个 `chart`：`chart` 只回答"谁高谁低"；`morph` 回答的是**"同一件事换一种呈现"**
 * —— 柱（离散）→ 线（连续）→ 面积（累计的量）。科普片里讲"换个角度看同一组数"时，这一步比再多一根柱子有用。
 *
 * 三个阶段都是一条时间轴上的纯函数，任意 seek 都对：
 *   p0（0.30→1.90s）柱子长高；p1（1.60→3.00s）柱子收成折线；p2（2.60→4.00s）折线下面铺排线。
 * 数据点的 x 位置**三个相位共用**（`slot` 只算一次），所以形变时观众的眼睛不用重新找位置。
 *
 * ```js
 * export default shot('morph', { values: [0.3, 0.55, 0.42, 0.7, 0.62, 0.9] });
 * ```
 */


import { contentOk, within } from './pick.js';
import { Pass } from '../core/gl.js';
import { css, ease, prog, clamp, polylineLengths, pointAtLength, mixColor } from '../core/util.js';
import { resolveTypeSize } from '../style/tokens.js';

/** 全部参数 = "什么都不传时的画面"（数值是示意读数，不是结论）。 */
const DEFAULTS = {
  id: 'morph',
  values: [0.22, 0.38, 0.31, 0.55, 0.48, 0.66, 0.72, 0.61, 0.86],
  title: '同一组数，换三种画法',
  sub: 'BAR → LINE → AREA  ·  位置不变，只换呈现',
  footer: '柱看高低 · 线看趋势 · 面积看累积',
};

/** 折线上取 x 处的 y（点集按 x 单调递增；超出两端就取端点）。 */
function yAt(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const k = (x - x0) / (x1 - x0 || 1e-9);
      return y0 + (y1 - y0) * k;
    }
  }
  return last[1];
}

/**
 * @param {{ id?: string, values?: number[], title?: string, sub?: string, footer?: string }} [opts]
 * @returns {any} 场景对象
 */
export function morphShot(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return {
    id: o.id,

    setup(ctx) {
      const P = ctx.P;
      // 整帧背景：墨底 + 极淡的横向细线（像坐标纸的背面）+ 一条很弱的底光
      this.bg = new Pass(ctx.gl, /* glsl */ `
        uniform vec3 ink, ink2, graphite, signal;
        void main() {
          vec2 p = FRAG_PX / RES_LOGICAL;
          vec3 col = mix(ink, ink2, smoothstep(0.0, 1.0, p.y));
          float l = abs(fract(p.y * 72.0) - 0.5) * 2.0;
          float w = fwidth(p.y * 72.0) * 1.5;
          col = mix(col, graphite * 0.5, (1.0 - smoothstep(w, w * 3.0, l)) * 0.06);
          col += signal * exp(-pow((p.y - 0.08) * 4.6, 2.0)) * 0.018;
          col += (hash12(FRAG_PX + fract(t) * 47.0) - 0.5) * 0.010;
          fragColor = vec4(col, 1.0);
        }`, {
        ink: P.ink, ink2: P.ink2, graphite: P.graphite, signal: P.signal,
      }, { key: 'shot_morph_bg', blend: false });
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
      const L = pad;
      const R = W - pad;
      const T = Math.round(H * 0.30);
      const B = grid?.contentBottom ?? Math.round(H * 0.833);

      const src = (Array.isArray(o.values) ? o.values : DEFAULTS.values)
        .map((v) => clamp(Number(v) || 0, 0, 1));
      const n = Math.max(2, src.length);
      const slot = (R - L) / n;
      const bw = slot * 0.52;
      const cx = (i) => L + slot * (i + 0.5);
      const topY = (v) => B - (B - T) * v;

      const p0 = ease.outCubic(prog(t, 0.30, 1.90));
      const p1 = ease.inOutCubic(prog(t, 1.60, 3.00));
      const p2 = ease.inOutCubic(prog(t, 2.60, 4.00));

      const pts = src.map((v, i) => [cx(i), topY(v)]);
      const acc = polylineLengths(pts);
      const total = acc[acc.length - 1] || 1;
      const drawn = total * p1;

      lines.begin();

      // 1) 网格：四条水平参考线（只在内容框里）
      for (let i = 0; i <= 4; i++) {
        const y = T + ((B - T) * i) / 4;
        lines.seg(L, y, R, y, 1, [P.graphite[0], P.graphite[1], P.graphite[2], 0.30]);
      }
      // 基线
      lines.seg(L, B, R, B, 2, [P.bone[0] * 0.5, P.bone[1] * 0.5, P.bone[2] * 0.5, 0.8]);

      // 2) 柱子：p0 长高，p1 里**缩回基线**（真正意义上的"形变"）；顶端的短横线留在原处，
      //    折线随后正好穿过它们 —— 观众看到的是"柱子退成刻度、刻度连成线"。
      src.forEach((v, i) => {
        const full = (B - T) * v;
        const h = full * p0 * (1 - 0.72 * p1);
        const isMax = v >= 0.85;
        const x = cx(i) - bw / 2;
        if (h > 0.5) {
          // 不透明调色，不用半透明 fillRect（柔边叠加会让块变亮、出横条；见 HANDOFF §11.2）
          const c = mixColor(P.ink2, isMax ? P.signal : P.bone, isMax ? 0.26 : 0.10 + 0.20 * v);
          lines.fillRect(x, B - h, bw, h, [c[0], c[1], c[2], 1], 2.5);
        }
        if (p0 > 0.02) {
          const ty = B - full;
          lines.seg(x - 4, ty, x + bw + 4, ty, 2,
            [P.bone[0] * 0.9, P.bone[1] * 0.9, P.bone[2] * 0.9, 0.95]);
        }
      });

      // 3) 折线：按弧长画到 drawn；已经画到的数据点打一个小点
      for (let i = 1; i < pts.length; i++) {
        if (drawn <= acc[i - 1]) break;
        const a = pts[i - 1];
        const b = pts[i];
        if (drawn >= acc[i]) {
          lines.seg(a[0], a[1], b[0], b[1], 3, P.signal);
        } else {
          const k = (drawn - acc[i - 1]) / (acc[i] - acc[i - 1] || 1e-9);
          lines.seg(a[0], a[1], a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, 3, P.signal);
        }
      }
      pts.forEach(([x, y], i) => {
        if (drawn >= acc[i] - 0.001 && p1 > 0.02) {
          lines.circle(x, y, 4.5, 2, P.bone, 18);
        }
      });

      // 4) 面积：折线下面铺排线（每 8px 一根竖线；不重叠，所以没有 alpha 叠加问题）
      if (p2 > 0.01) {
        // 排线只铺到"折线已经画到的地方" —— 面积是随线一起长出来的，不是先铺满整屏
        const headX = pointAtLength(pts, acc, drawn)[0];
        const step = 12;
        for (let x = L + step * 0.5; x <= headX; x += step) {
          const y = yAt(pts, x);
          if (y >= B - 2) continue;
          const edge = Math.min(1, (x - L) / 40) * Math.min(1, (R - x) / 40);
          // 笔尖附近淡出：否则面积会在 x=headX 处被一条硬边切掉，像贴图没裁好
          const head = clamp((headX - x) / 80);
          // 面积用**中性灰**排线，信号色只留给折线本身 —— 否则一整块橙色比线还抢眼
          const c = mixColor(P.ink2, P.bone, (0.07 + 0.05 * p2 * edge) * head);
          lines.seg(x, y + 3, x, B - 1, 2.5, [c[0], c[1], c[2], 1]);
        }
        // 面积的上边界再压一条骨白细线：让"面积"读起来是实心的，不是一排栅栏
        for (let i = 1; i < pts.length; i++) {
          lines.seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 1.5,
            [P.bone[0], P.bone[1], P.bone[2], 0.55 * p2]);
        }
      }
      lines.flush(ctx.out);

      // 5) 文字
      text.clear();
      type.write(String(o.sub ?? ''), pad, tagY, {
        size: 22, family: 'mono', tracking: 6, color: css(P.signal, 0.9),
      });
      type.write(String(o.title ?? ''), L, T - 56, {
        size: h2, weight: 700, family: 'sans', color: css(P.bone),
        stagger: 0.03, staggerDur: 0.5, from: 'up', dist: Math.round(h2 * 0.5), t: t - 0.15,
      });
      type.writeLine(String(o.footer ?? ''), Math.round(W / 2), footerY, {
        size: 24, family: 'mono', color: css(P.ash, 0.85), anchor: 'center',
        alpha: [0, 1], t: t - 1.9,
      });
      text.upload();
      comp.draw(gl, text, ctx.out, { premult: false });

      return {
        bloom: 0.30,
        bloomThreshold: 1.0,
        halation: 0.10,
        grain: 0.030,
        vignette: 0.42,
      };
    },
  };
}

morphShot.defaults = DEFAULTS;
morphShot.meta = {
  name: 'morph',
  summary: '图表形变：一组数先当柱子立起来，再收成一条折线，最后在折线下面铺出排线面积 —— 同一组数换三种画法，位置不变。',
  notes: '背景是自带的整帧 Pass（key `shot_morph_bg`），不需要时间线的 world。'
    + '三个相位：p0 0.30→1.90s 柱子长高 / p1 1.60→3.00s 收成折线 / p2 2.60→4.00s 铺面积。'
    + '段长不足约 4 秒会停在半路（那也算"没演完"，不是 bug）。'
    + '数据点的 x 三个相位共用，形变时位置不跳 —— 这是它与 `chart` 的分工：`chart` 只比高低，`morph` 讲"换一种呈现"。'
    + '⚠ 画面上的数要有出处（docs/FACTS-TEMPLATE.md ★）；默认值只是示意读数。',
  use: '讲"同一件事换一种呈现" —— 柱看高低、线看趋势、面积看累积',
  energy: '中',
  avoid: '只需要比高低时（chart 更省）；数值需要精确读数时（counter）',
  params: [
    { name: 'id', type: 'string', desc: '段名（HUD / --only / 报错里用它）' },
    { name: 'values', type: 'number[]', desc: '每个数据点的值（0..1）；长度 = 点数（少于 2 个按 2 个算）' },
    { name: 'title', type: 'string', desc: '图上方的主标题（逐字上浮）' },
    { name: 'sub', type: 'string', desc: '左上眉标（等宽小字；落在页眉保留带里）' },
    { name: 'footer', type: 'string', desc: '底部一行（页脚带里，最后淡入；空串则不画）' },
  ],
};

/**
 * 声明式 spec（docs/ENGINE.md §14.9）。
 *
 * requires: [] —— 只读 f.lt / P / 参数与自带背景 Pass。
 * outputs.visual = 'full-frame' —— setup() 里的整帧背景 Pass。
 */
morphShot.spec = {
  params: {
    id: 'string', values: 'number[]', title: 'string', sub: 'string', footer: 'string',
  },
  requires: [],
  outputs: { visual: 'full-frame', handlesTransition: false },
};

/* 选型元数据（BACKLOG 1-62）：tags / w / fits 的契约在 ./pick.js 头注释；brief 缺省字段 = 不设限。
   改这里不改模板画面，只改 anim shots --pick 会抽到谁。 */
morphShot.tags = ['data', 'graphic'];
morphShot.w = 0.7;
morphShot.fits = (q) => contentOk(q) && within(q?.points, 3, 8);
morphShot.fitsNote = '3–8 个值（points）；收尾位/转场位抽不到';
