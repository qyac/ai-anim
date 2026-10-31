// @ts-check
/**
 * 镜头模板：`bigtype` —— 一屏一句的**大字主张**（BACKLOG 1-48）。
 *
 * 定位：`title` 是"片名/章节名"（眉标 + 一条生长的横线 + 读数），`bigtype` 是**论点**
 * ——没有装饰性的刻度与读数，只有两三行大字、一条竖排引导线、一条下划线。
 * 它解决的是"一句话要占满一屏"这个最常见的诉求：手写场景时每次都要重新决定字号、
 * 行距、高亮词的位置，而这几件事在 11 个老模板里没有一处是可复用的。
 *
 * 关键设计：**高亮词（`mark`）是**切段画**的，不是叠色重画**。
 *   · 先在整行里找 `mark` 的子串，切成 前/中/后 三段，逐段按 `type.measure` 推进 x；
 *   · 每段的逐字延迟用 `t - 段首字数 × stagger` 续上，所以整行仍然像一口气打出来的；
 *   · 叠色重画会让信号色在动画途中的半透明阶段与骨白混成一团脏色（试过）。
 *
 * ```js
 * export default shot('bigtype', { line1: '把复杂的东西', line2: '讲成一句话', mark: '一句话' });
 * ```
 */


import { contentOk, atMost } from './pick.js';
import { Pass } from '../core/gl.js';
import { css, ease, prog } from '../core/util.js';
import { resolveTypeSize } from '../style/tokens.js';

/** 全部参数 = "什么都不传时的画面"。文案是中性示范句，不是结论（数字硬规则见 docs/FACTS-TEMPLATE.md ★）。 */
const DEFAULTS = {
  id: 'bigtype',
  kicker: 'BIG TYPE / 一句主张',
  line1: '把复杂的东西',
  line2: '讲成一句话',
  mark: '一句话',
  footer: '一屏只留一个主张 —— 其余交给旁白与字幕',
};

/**
 * 画一行字，并把其中一处 `mark` 用信号色切段画出来。
 *
 * @param {any} type TextKit（`ctx.type`）
 * @param {string} line 整行文本
 * @param {string} mark 要高亮的子串（找不到就整行同色）
 * @param {number} x @param {number} y
 * @param {any} st type.write 的样式与入场参数（size/weight/family/stagger/from/dist…）
 * @param {number} t0 这一行的时间基点
 * @param {string} bone 正文颜色（CSS）
 * @param {string} signal 高亮颜色（CSS）
 */
function writeMarked(type, line, mark, x, y, st, t0, bone, signal) {
  const s = String(line ?? '');
  const m = String(mark ?? '');
  const at = m ? s.indexOf(m) : -1;
  if (at < 0) {
    if (s) type.write(s, x, y, { ...st, color: bone, t: t0 });
    return;
  }
  const stagger = Number(st.stagger) || 0;
  let cx = x;
  /** 画一段并把 x 推进到下一段的起点；`skip` = 这一段之前已经有多少个字 */
  const put = (txt, color, skip) => {
    if (!txt) return;
    type.write(txt, cx, y, { ...st, color, t: t0 - skip * stagger });
    cx += type.measure(txt, st);
  };
  put(s.slice(0, at), bone, 0);
  put(m, signal, [...s.slice(0, at)].length);
  put(s.slice(at + m.length), bone, [...s.slice(0, at + m.length)].length);
}

/**
 * @param {{ id?: string, kicker?: string, line1?: string, line2?: string, mark?: string,
 *           footer?: string }} [opts]
 * @returns {any} 场景对象（`{ id, setup, render }`，可以直接放进时间线）
 */
export function bigtypeShot(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return {
    id: o.id,

    setup(ctx) {
      const P = ctx.P;
      // 整帧背景：墨底 + 极细的横向网点（印刷感）+ 左侧一团极弱信号光
      this.bg = new Pass(ctx.gl, /* glsl */ `
        uniform vec3 ink, ink2, graphite, signal;
        void main() {
          vec2 p = FRAG_PX / RES_LOGICAL;
          vec3 col = mix(ink, ink2, smoothstep(0.0, 1.0, p.y));
          // 细横线：距离用逻辑像素、线宽用 fwidth 单位（4K 下依然是一根细线）
          float l = abs(fract(p.y * 96.0) - 0.5) * 2.0;
          float w = fwidth(p.y * 96.0) * 1.5;
          col = mix(col, graphite * 0.5, (1.0 - smoothstep(w, w * 3.0, l)) * 0.07);
          // 左中一团很弱的光：让大字有"被照亮"的方向感，不平
          float gx = (p.x - 0.16) * 3.2;
          float gy = (p.y - 0.55) * 1.15;
          col += signal * exp(-(gx * gx + gy * gy)) * 0.012;
          // 极轻的颗粒（与 post 的 grain 不是同一个东西：这一层是"纸"）
          col += (hash12(FRAG_PX + fract(t) * 37.0) - 0.5) * 0.010;
          fragColor = vec4(col, 1.0);
        }`, {
        ink: P.ink, ink2: P.ink2, graphite: P.graphite, signal: P.signal,
      }, { key: 'shot_bigtype_bg', blend: false });
    },

    render(ctx) {
      const { f, gl, P, text, type, comp, lines, grid } = ctx;
      const { W, H } = gl;
      const t = f.lt;

      this.bg.render(gl, ctx.out, f.t, f.dt);

      const tokens = ctx.style?.tokens ?? {};
      const hero = resolveTypeSize('hero', tokens) ?? 136;
      const weight = tokens.weight?.hero ?? 800;
      const rule = tokens.rule ?? { hair: 1, body: 2.5, hero: 6 };
      const pad = grid?.pad ?? Math.round(W * 0.0625);
      const tagY = grid?.top ?? 92;
      const footerY = grid?.footerY ?? 1018;

      const x = Math.max(pad + 44, Math.round(W * 0.105));
      const lh = hero * 1.10;
      const y1 = Math.round(H * 0.42);
      const y2 = Math.round(y1 + lh);
      const st = {
        size: hero, weight, family: 'sans',
        stagger: 0.055, staggerDur: 0.62, from: 'up', dist: Math.round(hero * 0.42),
      };

      // 1) 矢量：左侧引导线（生长）+ 线上的游标 + 大字下面的下划线 + 底部一条发丝线
      const railX = x - 44;
      const railTop = Math.round(y1 - hero * 0.82);
      const railBot = Math.round(y2 + 44);
      const grow = ease.outCubic(prog(t, 0.10, 1.15));
      // 引导线：骨白 0.42 的"刻度尺"，外加一个沿线下滑的信号色游标（两端各一小段横帽）
      const railA = [P.bone[0] * 0.42, P.bone[1] * 0.42, P.bone[2] * 0.42, 0.9];
      lines.begin();
      lines.seg(railX, railTop, railX, railTop + (railBot - railTop) * grow, 2, railA);
      if (grow > 0.02) {
        const tickY = railTop + (railBot - railTop) * prog(t, 0.45, 3.2, 'inOutCubic');
        lines.seg(railX - 14, tickY, railX + 14, tickY, 4, P.signal);
        lines.seg(railX - 14, railTop, railX - 14, railBot, 1,
          [P.graphite[0], P.graphite[1], P.graphite[2], 0.5]);
      }
      // 下划线：按第二行的实际宽度铺开（宽度来自字体，不写死）
      const w2 = type.measure(String(o.line2 ?? ''), { size: hero, weight, family: 'sans' });
      const ul = ease.outExpo(prog(t, 0.85, 2.1));
      lines.seg(x, y2 + 38, x + w2 * ul, y2 + 38, 3, P.signal);
      // 底部发丝线 + 一个顺线走的信号点（全片唯一一直在动的东西）
      const by = Math.min(H * 0.88, (grid?.contentBottom ?? 900) + 26);
      const bx1 = W - pad;
      lines.seg(x, by, bx1, by, rule.hair ?? 1,
        [P.graphite[0], P.graphite[1], P.graphite[2], 0.7]);
      const dotX = x + (bx1 - x) * prog(t, 0.2, 4.2, 'inOutCubic');
      lines.seg(dotX - 9, by, dotX + 9, by, 3, P.signal);
      lines.flush(ctx.out);

      // 2) 文字层
      text.clear();
      type.write(String(o.kicker ?? ''), pad, tagY, {
        size: 22, family: 'mono', tracking: 6, color: css(P.signal, 0.9),
      });
      const bone = css(P.bone);
      const signal = css(P.signal);
      writeMarked(type, o.line1, o.mark, x, y1, st, t - 0.25, bone, signal);
      writeMarked(type, o.line2, o.mark, x, y2, st, t - 0.33, bone, signal);
      type.writeLine(String(o.footer ?? ''), Math.round(W / 2), footerY, {
        size: 26, family: 'mono', color: css(P.ash, 0.85), anchor: 'center',
        alpha: [0, 1], t: t - 1.5,
      });
      text.upload();
      comp.draw(gl, text, ctx.out, { premult: false });

      return {
        bloom: 0.30,
        bloomThreshold: 1.05,
        halation: 0.16,
        grain: 0.032,
        vignette: 0.46,
        exposure: 1 + 0.012 * Math.sin(t * 1.1),
      };
    },
  };
}

bigtypeShot.defaults = DEFAULTS;
bigtypeShot.meta = {
  name: 'bigtype',
  summary: '大字主张：两三行 hero 级大字逐字上浮 + 一处关键词换信号色 + 左侧引导线与下划线',
  notes: '背景是本模板自带的整帧 Pass（key `shot_bigtype_bg`），自己铺满整帧，'
    + '不需要时间线的 world，也不能和别的模板叠在同一段。'
    + '\`mark\` 是**切段画**出来的（前/中/后三段按 measure 推进），不是叠色重画 —— '
    + '叠色在动画途中会和骨白混成脏色。行距 = hero × 1.10，字号跟着风格包的语义字号走（docs/STYLE.md §4.1）。',
  use: '一屏一句主张 / 一章的分论点 —— 让观众只读这一句',
  energy: '中',
  avoid: '需要同时给出数据或图时（改用 chart / counter）；一句话超过两行会挤出下划线',
  params: [
    { name: 'id', type: 'string', desc: '段名（HUD / --only / 报错里用它）' },
    { name: 'kicker', type: 'string', desc: '左上眉标（等宽小字；落在页眉保留带里，不进版面判据）' },
    { name: 'line1', type: 'string', desc: '第一行大字' },
    { name: 'line2', type: 'string', desc: '第二行大字（下划线的宽度按这一行量）' },
    { name: 'mark', type: 'string', desc: '要高亮成信号色的子串（找不到就整行同色；会先在第一行里找，再在第二行里找）' },
    { name: 'footer', type: 'string', desc: '底部一行（页脚带里，最后淡入；空串则不画）' },
  ],
};

/**
 * 声明式 spec（docs/ENGINE.md §14.9；anim shots --json 与 check 的依赖前置校验读它）。
 *
 * requires: [] 的依据：render() 只读 f.lt / P / 参数与自带的背景 Pass —— 不读 ctx.music / ctx.under。
 * outputs.visual = 'full-frame' 的依据是 setup() 里那张整帧背景 Pass。
 */
bigtypeShot.spec = {
  params: {
    id: 'string', kicker: 'string', line1: 'string', line2: 'string', mark: 'string', footer: 'string',
  },
  requires: [],
  outputs: { visual: 'full-frame', handlesTransition: false },
};

/* 选型元数据（BACKLOG 1-62）：tags / w / fits 的契约在 ./pick.js 头注释；brief 缺省字段 = 不设限。
   改这里不改模板画面，只改 anim shots --pick 会抽到谁。 */
bigtypeShot.tags = ['title', 'pop', 'graphic'];
bigtypeShot.w = 1.2;
bigtypeShot.fits = (q) => contentOk(q) && atMost(q?.chars, 24);
bigtypeShot.fitsNote = '一屏一句 ≤24 字（chars）；收尾位/转场位抽不到';
