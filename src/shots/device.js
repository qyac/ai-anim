// @ts-check
/**
 * 镜头模板：`device` —— **界面窗口**：一个窗口框 + 标题栏 + 内容骨架行，逐行"加载"出来（BACKLOG 1-48）。
 *
 * 为什么需要它：说明"产品 / 界面"时，手画一个窗口框是每支片子都要重写一遍的活，而且十次有九次
 * 画得太满（标题栏 + 工具栏 + 侧栏 + 内容 + 按钮…）—— 观众反而看不到要讲的那一处。
 * 这个模板只留三层：**窗口（介质）+ 一句标题（说了什么）+ 几行内容（结构）**。
 *
 * 想要真截图就把它当底：真图当纹理画进来更省事、也更像（`docs/COOKBOOK.md` §9），
 * 这个模板是"没有截图时"的默认答案，不是"有截图还硬画"。
 *
 * ```js
 * export default shot('device', { title: '一条命令就能跑', rows: [0.82, 0.64, 0.9, 0.46] });
 * ```
 */

import { Pass } from '../core/gl.js';
import { css, ease, prog, clamp, cycle, mixColor } from '../core/util.js';
import { resolveTypeSize } from '../style/tokens.js';

/** 全部参数 = "什么都不传时的画面"。`rows` 是每一行内容的宽度占内容区的比例。 */
const DEFAULTS = {
  id: 'device',
  kicker: 'DEVICE / 界面',
  chrome: 'anim.local / preview',
  title: '一屏只说一件事',
  rows: [0.86, 0.62, 0.74, 0.44],
  footer: '窗口是介质，不是主体 —— 主体是那句话',
};

/**
 * @param {{ id?: string, kicker?: string, chrome?: string, title?: string,
 *           rows?: number[], footer?: string }} [opts]
 * @returns {any} 场景对象
 */
export function deviceShot(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return {
    id: o.id,

    setup(ctx) {
      const P = ctx.P;
      // 整帧背景：墨底 + 窗口后面一团很弱的抬亮（"屏幕在发光"）+ 极细网点
      this.bg = new Pass(ctx.gl, /* glsl */ `
        uniform vec3 ink, ink2, graphite, signal;
        void main() {
          vec2 p = FRAG_PX / RES_LOGICAL;
          vec3 col = mix(ink, ink2, smoothstep(0.0, 1.0, p.y));
          float g = exp(-pow((p.x - 0.5) * 2.1, 2.0) - pow((p.y - 0.52) * 1.7, 2.0));
          col += mix(vec3(1.0), signal, 0.35) * g * 0.035;
          float l = abs(fract(FRAG_PX.y / 4.0) - 0.5) * 2.0;
          float w = fwidth(FRAG_PX.y / 4.0) * 1.5;
          col = mix(col, graphite * 0.4, (1.0 - smoothstep(w, w * 3.0, l)) * 0.05);
          col += (hash12(FRAG_PX + fract(t) * 29.0) - 0.5) * 0.010;
          fragColor = vec4(col, 1.0);
        }`, {
        ink: P.ink, ink2: P.ink2, graphite: P.graphite, signal: P.signal,
      }, { key: 'shot_device_bg', blend: false });
    },

    render(ctx) {
      const { f, gl, P, text, type, comp, lines, grid } = ctx;
      const { W, H } = gl;
      const t = f.lt;

      this.bg.render(gl, ctx.out, f.t, f.dt);

      const tokens = ctx.style?.tokens ?? {};
      const h2 = resolveTypeSize('h2', tokens) ?? 56;
      const rule = tokens.rule ?? { hair: 1, body: 2.5, hero: 6 };
      const pad = grid?.pad ?? Math.round(W * 0.0625);
      const tagY = grid?.top ?? 92;
      const footerY = grid?.footerY ?? 1018;

      const x0 = Math.round(W * 0.225);
      const w0 = Math.round(W * 0.55);
      const y0 = Math.round(H * 0.265);
      const h0 = Math.round(H * 0.44);
      const barH = Math.max(34, Math.round(h0 * 0.105));
      const innerX = x0 + Math.round(w0 * 0.055);

      // 1) 窗口框：四条边依次画出来（上 → 右 → 下 → 左），比整圈一下子出现更像"展开"
      const e = [P.graphite[0], P.graphite[1], P.graphite[2]];
      const edge = [e[0] * 1.5, e[1] * 1.5, e[2] * 1.5, 0.95];
      const k1 = ease.outCubic(prog(t, 0.10, 0.55));
      const k2 = ease.outCubic(prog(t, 0.35, 0.80));
      const k3 = ease.outCubic(prog(t, 0.60, 1.05));
      const k4 = ease.outCubic(prog(t, 0.85, 1.30));
      lines.begin();
      lines.seg(x0, y0, x0 + w0 * k1, y0, rule.body ?? 2.5, edge);
      lines.seg(x0 + w0, y0, x0 + w0, y0 + h0 * k2, rule.body ?? 2.5, edge);
      lines.seg(x0 + w0, y0 + h0, x0 + w0 * (1 - k3), y0 + h0, rule.body ?? 2.5, edge);
      lines.seg(x0, y0 + h0, x0, y0 + h0 * (1 - k4), rule.body ?? 2.5, edge);

      // 标题栏分隔线 + 三个圆点（红黄绿的抽象：只用信号色 + 两个灰）
      const barK = ease.outCubic(prog(t, 1.0, 1.6));
      lines.seg(x0 + 1, y0 + barH, x0 + 1 + (w0 - 2) * barK, y0 + barH, rule.hair ?? 1,
        [P.graphite[0], P.graphite[1], P.graphite[2], 0.8]);
      for (let i = 0; i < 3; i++) {
        const cx = x0 + 20 + i * 16;
        const cy = y0 + barH * 0.5;
        const lit = clamp((t - 1.2 - i * 0.08) * 4);
        lines.circle(cx, cy, 4, 1,
          i === 0 ? [P.signal[0] * lit, P.signal[1] * lit, P.signal[2] * lit, 0.9]
            : [P.graphite[0] * lit, P.graphite[1] * lit, P.graphite[2] * lit, 0.9], 16);
      }

      // 内容行：逐行从左填出来；宽度来自 rows（0..1）
      const src = Array.isArray(o.rows) && o.rows.length ? o.rows : DEFAULTS.rows;
      const contentTop = y0 + barH + Math.round(h0 * 0.16);
      const rowGap = Math.max(16, Math.round(h0 * 0.085));
      const rowH = Math.max(7, Math.round(h0 * 0.032));
      const contentW = w0 - (innerX - x0) * 2;
      let ry = contentTop + Math.round(h2 * 1.35);
      src.forEach((v, i) => {
        const k = ease.outCubic(prog(t, 1.35 + i * 0.16, 1.95 + i * 0.16));
        const frac = clamp(Number(v) || 0, 0.04, 1);
        const ww = contentW * frac * k;
        // 主行（第一行）是"正文"，其余是"骨架"。
        // ⚠ 用不透明的调色，不用半透明 fillRect：fillRect 是"一叠胶囊"，柔边互相叠加 ⇒
        //   半透明的横条会出现横向条纹，而且比写的 alpha 亮得多（见 scan.js 同一处注释）。
        const c = i === 0 ? mixColor(P.ink2, P.bone, 0.40) : mixColor(P.ink2, P.ash, 0.22);
        lines.fillRect(innerX, ry, Math.max(0, ww), rowH, [c[0], c[1], c[2], 1], 2);
        ry += rowGap;
      });

      // 光标：最后一行末尾那根竖线（用 cycle 做确定性闪烁，不用逐帧随机）
      const blink = cycle(t * 1.9, 1) < 0.55 ? 1 : 0;
      if (blink) {
        const lastK = ease.outCubic(prog(t, 1.35 + (src.length - 1) * 0.16, 1.95 + (src.length - 1) * 0.16));
        const frac = clamp(Number(src[src.length - 1]) || 0, 0.04, 1);
        const cx = innerX + contentW * frac * lastK + 6;
        const cy = ry - rowGap;
        lines.seg(cx, cy - 2, cx, cy + rowH + 2, 2, P.signal);
      }

      // 标题栏下面一条"加载条"：慢速从左填到右（UI 的惯用语，比一条扫过画面的红线安静）
      const load = prog(t, 1.15, 4.4, 'inOutCubic');
      const trackY = y0 + barH + 0.5;
      lines.seg(x0 + 1, trackY, x0 + w0 - 1, trackY, 1,
        [P.graphite[0], P.graphite[1], P.graphite[2], 0.55]);
      lines.seg(x0 + 1, trackY, x0 + 1 + (w0 - 2) * load, trackY, 2.5, P.signal);
      lines.flush(ctx.out);

      // 2) 文字层
      text.clear();
      type.write(String(o.kicker ?? ''), pad, tagY, {
        size: 22, family: 'mono', tracking: 6, color: css(P.signal, 0.9),
      });
      type.write(String(o.chrome ?? ''), x0 + 78, y0 + barH * 0.5 + 6, {
        size: 18, family: 'mono', color: css(P.ash, 0.85),
      });
      type.write(String(o.title ?? ''), innerX, contentTop, {
        size: h2, weight: 700, family: 'sans', color: css(P.bone),
        stagger: 0.03, staggerDur: 0.5, from: 'up', dist: Math.round(h2 * 0.5), t: t - 0.95,
      });
      type.writeLine(String(o.footer ?? ''), Math.round(W / 2), footerY, {
        size: 24, family: 'mono', color: css(P.ash, 0.85), anchor: 'center',
        alpha: [0, 1], t: t - 1.8,
      });
      text.upload();
      comp.draw(gl, text, ctx.out, { premult: false });

      return {
        bloom: 0.26,
        bloomThreshold: 1.1,
        halation: 0.14,
        grain: 0.030,
        vignette: 0.44,
      };
    },
  };
}

deviceShot.defaults = DEFAULTS;
deviceShot.meta = {
  name: 'device',
  summary: '界面窗口：窗口框四条边依次展开 + 标题栏（三个圆点 + 地址）+ 一句标题 + 几行逐行填出来的内容骨架 + 一根闪烁光标。',
  notes: '背景是自带的整帧 Pass（key `shot_device_bg`），不需要时间线的 world。'
    + '**有真截图时就别用它**：真图当纹理画进来更省事也更像（docs/COOKBOOK.md §9）；'
    + '这个模板是"没有截图时"的默认答案。'
    + '`rows` 是每行内容的宽度占内容区的比例（0..1），长度决定行数；第一行按"正文"亮度画，其余是骨架。'
    + '光标闪烁走 `cycle(t)`（确定性），不是逐帧随机。',
  use: '讲"产品 / 界面 / 一次操作"这一层，又没有真截图可用',
  energy: '中低',
  avoid: '有真截图 / 录屏时；需要读出界面里的具体文字时（模板只画结构）',
  params: [
    { name: 'id', type: 'string', desc: '段名（HUD / --only / 报错里用它）' },
    { name: 'kicker', type: 'string', desc: '左上眉标' },
    { name: 'chrome', type: 'string', desc: '标题栏里那行等宽小字（像地址栏 / 文件名）' },
    { name: 'title', type: 'string', desc: '窗口里那句标题（h2 级，逐字上浮）' },
    { name: 'rows', type: 'number[]', desc: '每行内容的宽度比例（0..1）；长度 = 行数' },
    { name: 'footer', type: 'string', desc: '底部一行（页脚带里，最后淡入；空串则不画）' },
  ],
};

/**
 * 声明式 spec（docs/ENGINE.md §14.9）。
 *
 * requires: [] —— 只读 f.lt / P / 参数与自带背景 Pass。
 * outputs.visual = 'full-frame' —— setup() 里的整帧背景 Pass。
 */
deviceShot.spec = {
  params: {
    id: 'string', kicker: 'string', chrome: 'string', title: 'string', rows: 'number[]', footer: 'string',
  },
  requires: [],
  outputs: { visual: 'full-frame', handlesTransition: false },
};
