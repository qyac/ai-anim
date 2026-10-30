// @ts-check
/**
 * 镜头模板：`lockup` —— **署名组合**（收尾卡）：一个几何标记 + 字标 + 一句副标 + 一条分隔线（BACKLOG 1-48 第二批）。
 *
 * 与 `outro` 的分工：`outro` 是"一支片子的片尾"（细线收拢 → 大字 → 压黑），它是一个**动作**；
 * `lockup` 是那张**定版**——标记与字标一起出现、然后停住，不给压黑，方便当章末 / 系列片尾 /
 * 短视频的最后一屏（也方便单独抽一帧当封面底）。要压黑与收拢动作就回 `outro`。
 *
 * 全部动效都是一条时间轴上的纯函数：环从 12 点顺时针长出来（0.2→1.2s）、
 * 菱形四边依次画（0.5→1.3s）、字标逐字上浮（0.7s 起）、分隔线从中间展开、副标与署名最后淡入。
 *
 * ```js
 * export default shot('lockup', { name: '写代码，就是做动画', tagline: 'CODE-RENDERED MOTION' });
 * ```
 */


import { endingOnly } from './pick.js';
import { Pass } from '../core/gl.js';
import { css, ease, prog, clamp, TAU } from '../core/util.js';
import { resolveTypeSize } from '../style/tokens.js';

/** 全部参数 = "什么都不传时的画面"。 */
const DEFAULTS = {
  id: 'lockup',
  mark: 'ring',
  kicker: 'LOCKUP / 定版',
  name: '写代码，就是做动画',
  tagline: 'CODE-RENDERED MOTION',
  meta: 'anim · 确定性渲染 · 任意时刻可重放',
  footer: '',
};

/** 可用的标记（写错在工厂里就抛，不会渲染成一屏看不懂的东西）。 */
const MARKS = ['ring', 'diamond', 'square'];

/**
 * @param {{ id?: string, mark?: string, kicker?: string, name?: string, tagline?: string,
 *           meta?: string, footer?: string }} [opts]
 * @returns {any} 场景对象
 */
export function lockupShot(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!MARKS.includes(o.mark)) {
    throw new Error(`lockup 的 mark 只能是 ${MARKS.join(' / ')}，收到 ${JSON.stringify(o.mark)}`);
  }
  return {
    id: o.id,

    setup(ctx) {
      const P = ctx.P;
      // 整帧背景：墨底 + 一团居中的极弱暖光（定版要"静"，所以只有光，没有网格）
      this.bg = new Pass(ctx.gl, /* glsl */ `
        uniform vec3 ink, ink2, signal;
        void main() {
          vec2 p = FRAG_PX / RES_LOGICAL;
          vec3 col = mix(ink, ink2, smoothstep(0.0, 1.0, p.y) * 0.7);
          float g = exp(-pow((p.x - 0.5) * 2.1, 2.0) - pow((p.y - 0.52) * 2.3, 2.0));
          col += mix(vec3(1.0), signal, 0.55) * g * 0.028;
          col += (hash12(FRAG_PX + fract(t) * 39.0) - 0.5) * 0.009;
          fragColor = vec4(col, 1.0);
        }`, {
        ink: P.ink, ink2: P.ink2, signal: P.signal,
      }, { key: 'shot_lockup_bg', blend: false });
    },

    render(ctx) {
      const { f, gl, P, text, type, comp, lines, grid } = ctx;
      const { W, H } = gl;
      const t = f.lt;

      this.bg.render(gl, ctx.out, f.t, f.dt);

      const tokens = ctx.style?.tokens ?? {};
      const h1 = resolveTypeSize('h1', tokens) ?? 96;
      const rule = tokens.rule ?? { hair: 1, body: 2.5, hero: 6 };
      const pad = grid?.pad ?? Math.round(W * 0.0625);
      const tagY = grid?.top ?? 92;
      const footerY = grid?.footerY ?? 1018;

      const cx = W * 0.5;
      const cy = Math.round(H * 0.345);
      const R = Math.round(Math.min(W, H) * 0.082);

      // 1) 标记：环 / 菱形 / 方块，三种都用同一套"画出来"的时间轴
      const pRing = ease.inOutCubic(prog(t, 0.20, 1.25));
      const pDia = ease.inOutCubic(prog(t, 0.50, 1.35));
      const pDot = ease.outBack(prog(t, 0.95, 1.45));
      lines.begin();
      if (o.mark === 'ring') {
        // 环：从 12 点顺时针长出来（首尾各留一段小缺口，像手画的）
        const segs = 64;
        const span = TAU * pRing;
        const start = -Math.PI / 2;
        for (let i = 0; i < segs; i++) {
          if ((i + 1) / segs > pRing) break;
          const a0 = start + (span * i) / segs;
          const a1 = start + (span * (i + 1)) / segs;
          lines.seg(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R,
            cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, rule.body ?? 2.5, P.bone);
        }
      } else if (o.mark === 'diamond') {
        const d = R * 0.92;
        const corners = [[cx, cy - d], [cx + d, cy], [cx, cy + d], [cx - d, cy], [cx, cy - d]];
        for (let i = 0; i < 4; i++) {
          const k = clamp((pDia - i / 4) * 4);
          if (k <= 0) break;
          const [x0, y0] = corners[i];
          const [x1, y1] = corners[i + 1];
          lines.seg(x0, y0, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, rule.body ?? 2.5, P.bone);
        }
      } else {
        const s = R * 0.82;
        const corners = [[cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s], [cx - s, cy - s]];
        for (let i = 0; i < 4; i++) {
          const k = clamp((pDia - i / 4) * 4);
          if (k <= 0) break;
          const [x0, y0] = corners[i];
          const [x1, y1] = corners[i + 1];
          lines.seg(x0, y0, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, rule.body ?? 2.5, P.bone);
        }
      }
      // 中心：一颗信号色的小点（定版里唯一的高光）
      if (pDot > 0.02) {
        lines.circle(cx, cy, 7 * pDot, 3, P.signal, 20);
        lines.circle(cx, cy, 16 * pDot, 1,
          [P.signal[0], P.signal[1], P.signal[2], 0.30], 24);
      }
      // 2) 分隔线：从中心向两侧展开，中间一个信号色刻度
      const pRule = ease.outCubic(prog(t, 1.35, 2.2));
      const ruleHalf = Math.min(W * 0.16, 320) * pRule;
      const ruleY = Math.round(H * 0.735);
      if (pRule > 0.01) {
        lines.seg(cx - ruleHalf, ruleY, cx + ruleHalf, ruleY, rule.hair ?? 1,
          [P.bone[0] * 0.7, P.bone[1] * 0.7, P.bone[2] * 0.7, 0.85]);
        lines.seg(cx, ruleY - 7, cx, ruleY + 7, 2.5, P.signal);
      }
      lines.flush(ctx.out);

      // 3) 文字：眉标 / 字标 / 副标 / 署名
      text.clear();
      const kicker = String(o.kicker ?? '');
      if (kicker) {
        type.write(kicker, pad, tagY, {
          size: 22, family: 'mono', tracking: 6, color: css(P.signal, 0.9),
        });
      }
      type.write(String(o.name ?? ''), Math.round(cx), Math.round(H * 0.575), {
        size: h1, weight: 800, family: 'sans', color: css(P.bone), align: 'center',
        stagger: 0.045, staggerDur: 0.6, from: 'up', dist: Math.round(h1 * 0.45),
        t: t - 0.65,
      });
      const tagline = String(o.tagline ?? '');
      if (tagline) {
        type.write(tagline, Math.round(cx), Math.round(H * 0.645), {
          size: 26, family: 'mono', tracking: 8, color: css(P.signal, 0.9), align: 'center',
          alpha: [0, 1], t: t - 1.45,
        });
      }
      const meta = String(o.meta ?? '');
      if (meta) {
        type.writeLine(meta, Math.round(cx), Math.round(H * 0.805), {
          size: 21, family: 'mono', color: css(P.ash, 0.85), anchor: 'center',
          alpha: [0, 1], t: t - 2.0,
        });
      }
      const footer = String(o.footer ?? '');
      if (footer) {
        type.writeLine(footer, Math.round(W / 2), footerY, {
          size: 22, family: 'mono', color: css(P.ash, 0.75), anchor: 'center',
          alpha: [0, 1], t: t - 2.2,
        });
      }
      text.upload();
      comp.draw(gl, text, ctx.out, { premult: false });

      return {
        bloom: 0.34,
        bloomThreshold: 1.0,
        halation: 0.10,
        grain: 0.028,
        vignette: 0.50,
      };
    },
  };
}

lockupShot.defaults = DEFAULTS;
lockupShot.meta = {
  name: 'lockup',
  summary: '署名组合（定版）：几何标记（环 / 菱形 / 方块）+ 字标 + 副标 + 从中间展开的分隔线 + 署名行，最后停住不压黑。',
  notes: '背景是自带的整帧 Pass（key `shot_lockup_bg`），不需要时间线的 world。'
    + '与 `outro` 的分工：`outro` 是"片尾动作"（收拢 + 压黑），`lockup` 是"那张定版"（停住、可当封面底）。'
    + '`mark` 只认 ring / diamond / square —— **写错在工厂里就抛**（不会画出一屏看不懂的东西）。'
    + '`tagline` 与 `meta` 空串时不画那一行。',
  use: '章末 / 系列片尾 / 短视频最后一屏 —— 标记与字标一起定住',
  energy: '低',
  avoid: '需要"收尾动作"或压黑时（用 outro）；一屏还要讲第三件事时',
  params: [
    { name: 'id', type: 'string', desc: '段名（HUD / --only / 报错里用它）' },
    { name: 'mark', type: 'string', desc: "标记形状：'ring' / 'diamond' / 'square'（写错抛错）" },
    { name: 'kicker', type: 'string', desc: '左上眉标（空串则不画）' },
    { name: 'name', type: 'string', desc: '字标（居中大字，逐字上浮）' },
    { name: 'tagline', type: 'string', desc: '字标下面那行等宽副标（空串则不画）' },
    { name: 'meta', type: 'string', desc: '分隔线下面的署名行（空串则不画）' },
    { name: 'footer', type: 'string', desc: '页脚带里的一行小字（空串则不画）' },
  ],
};

/**
 * 声明式 spec（docs/ENGINE.md §14.9）。
 *
 * requires: [] —— 只读 f.lt / P / 参数与自带背景 Pass。
 * outputs.visual = 'full-frame' —— setup() 里的整帧背景 Pass。
 */
lockupShot.spec = {
  params: {
    id: 'string', mark: 'string', kicker: 'string', name: 'string', tagline: 'string',
    meta: 'string', footer: 'string',
  },
  requires: [],
  outputs: { visual: 'full-frame', handlesTransition: false },
};

/* 选型元数据（BACKLOG 1-62）：tags / w / fits 的契约在 ./pick.js 头注释；brief 缺省字段 = 不设限。
   改这里不改模板画面，只改 anim shots --pick 会抽到谁。 */
lockupShot.tags = ['ending', 'graphic'];
lockupShot.w = 0.9;
lockupShot.fits = endingOnly;
lockupShot.fitsNote = '只抽收尾位（slot: ending）';
