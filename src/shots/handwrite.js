// @ts-check
/**
 * 镜头模板：`handwrite` —— **白板/纸上的手写讲解**（BACKLOG 1-69；素材包缺口表第 6 行，覆盖 17 条）。
 *
 * 画面是「有人正在写」：一笔一笔按弧长生长出来，每一笔两端细、中间粗（笔压），
 * 笔迹每 2 帧重描一次（手绘动画的重描节奏），最后一行手写风格的标题压上来。
 *
 * ## 与 `cel` / `lineart` 的差别（这三者很容易被当成同一件事）
 *
 *   - `lineart`：一条**等宽**折线按弧长生长。它讲的是「顺序」，不是「手」。
 *   - `cel`：等宽线条 + 12fps 抖动。它讲的是「这是画出来的」，但线没有粗细变化。
 *   - `handwrite`：**宽度沿弧长变化**。加了这条之后，「写」这件事才成立 ——
 *     落笔细、行笔粗、收笔细，观众的眼睛跟着笔尖走，而不是跟着一条线走。
 *
 * ## 三条写错不报错、只出错画面的（几何层在 `src/kit/stroke.js` 里都有单测）
 *
 *   ① 笔画**不能**用半透明色 —— 一笔是多条扫描线拼的，抗锯齿边会叠加出横纹；
 *      要淡就用 `inkOn()`（先与纸色混合、再整块不透明地画）。
 *   ② 宽度沿弧长的变化率超过 `MAX_WIDTH_SLOPE` 时轮廓**自交**，偶奇规则把它填成洞
 *      —— 笔画中间会长出一个蝴蝶结形的空白。`pressureProfile` 已经夹过，别绕过它自己算宽度。
 *   ③ 两端圆头的半径要用**这一端自己的半宽**；用平均值会在收笔处鼓一个包（读成「墨滴」）。
 *
 * ```js
 * export default shot('handwrite', { title: '一笔一笔写', mode: 'whiteboard' });
 * ```
 */

import { Pass } from '../core/gl.js';
import { css, ease, prog, sat } from '../core/util.js';
import { strokePath, strokeArc, inkOn } from '../kit/stroke.js';
import { resolveTypeSize } from '../style/tokens.js';

/** 手写体栈：楷体优先（中文手写笔记的默认观感），拉丁用 Cormorant。 */
const HAND = "'KaiTi', 'STKaiti', 'Kaiti SC', 'Cormorant Garamond', serif";

/** 全部参数 = 什么都不传时的画面（文案是中性示范，不含数字 —— 数字要有出处）。 */
const DEFAULTS = {
  id: 'handwrite',
  kicker: 'HANDWRITE / 白板讲解',
  title: '一笔一笔写',
  sub: '落笔细 · 行笔粗 · 收笔细',
  footer: '笔压是宽度沿弧长的包络 —— 不是给折线加个抖动',
  mode: 'whiteboard',
  seed: 3,
  boil: 1.4,
};

/**
 * @param {{ id?: string, kicker?: string, title?: string, sub?: string, footer?: string,
 *           mode?: 'whiteboard'|'paper', seed?: number, boil?: number }} [opts]
 * @returns {any} 场景对象
 */
export function handwriteShot(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return {
    id: o.id,
    focus: 'center',

    setup(ctx) {
      // 整帧底：一块白板（冷白 + 极淡的擦拭痕）或一张纸（暖白 + 横格线）
      const board = o.mode === 'paper' ? 0 : 1;
      this.bg = new Pass(ctx.gl, /* glsl */ `
        uniform vec3 cBase, cFibre, cLine;
        uniform float board;
        void main() {
          vec2 p = vUv;
          vec3 col = cBase;
          // 底色不是平的：中间亮一点（灯在头顶），四角压一档
          float r = length((p - vec2(0.5, 0.46)) * vec2(1.06, 1.0));
          col *= 1.0 - 0.055 * smoothstep(0.35, 1.15, r);
          // 纤维 / 擦拭痕：低频的斑，不是噪点（噪点会读成「脏」）
          float n = vnoise(FRAG_PX / 90.0) * 0.5 + vnoise(FRAG_PX / 31.0) * 0.5;
          col = mix(col, cFibre, (n - 0.5) * 0.10 + 0.02);
          // 纸：横格线（白板没有）
          if (board < 0.5) {
            float y = FRAG_PX.y / RES_LOGICAL.y;
            float du = abs(fract(y * 21.0) - 0.5) * 2.0;
            float wpx = fwidth(y * 21.0) * 1.6;
            col = mix(col, cLine, (1.0 - smoothstep(wpx, wpx * 2.2, du)) * 0.35 * step(0.14, y));
            // 左边一条红边线（笔记本的规矩线）
            float dx = abs(FRAG_PX.x / RES_LOGICAL.x - 0.085) * RES_LOGICAL.x;
            col = mix(col, cLine, (1.0 - smoothstep(0.6, 2.0, dx)) * 0.5 * step(0.14, y));
          }
          fragColor = vec4(col, 1.0);
        }`,
        {
          cBase: board ? [0.93, 0.94, 0.92] : [0.965, 0.945, 0.885],
          cFibre: board ? [0.80, 0.84, 0.84] : [0.90, 0.85, 0.76],
          cLine: board ? [0.78, 0.82, 0.82] : [0.62, 0.72, 0.80],
          board,
        },
        { key: 'shot_handwrite_bg', blend: false });
      // 墨色：白板是深蓝黑记号笔，纸是蓝黑钢笔（都不纯黑 —— 纯黑一眼是屏幕）
      const ink0 = board ? [0.055, 0.075, 0.10] : [0.07, 0.09, 0.17];
      this.ink = ink0;
      this.accent = board ? [0.62, 0.13, 0.10] : [0.66, 0.16, 0.12];
      const paper = board ? [0.93, 0.94, 0.92] : [0.965, 0.945, 0.885];
      this.paper = paper;
      // 墨色一律**不透明**（笔迹不许半透明，见文件头第 ① 条）：要淡就与纸色混合
      this.inkSoft = inkOn(ink0, 0.55, paper);
      this.inkMid = inkOn(ink0, 0.82, paper);
      this.inkSig = inkOn(this.accent, 0.95, paper);
      this.inkPale = inkOn(ctx.P.graphite, 0.55, paper);
    },

    render(ctx) {
      const { f, gl, text, type, comp, lines, W, H, grid } = ctx;
      const t = f.p;                                  // 段内进度：时长变了节奏跟着缩放
      const tt = f.lt;
      this.bg.render(gl, ctx.out, f.t, f.dt);

      const pad = grid?.pad ?? Math.round(W * 0.075);
      const top = grid?.top ?? 96;
      const foot = grid?.footerY ?? 1018;
      const contentBottom = grid?.contentBottom ?? Math.round(H * 0.833);
      const bx = pad;
      const bw = W - pad * 2;
      const by = Math.round(H * 0.30);
      const bh = contentBottom - by - Math.round(H * 0.03);
      const boil = { t: f.t, seed: o.seed ?? 0, amp: Number(o.boil ?? 0) };
      // 每一笔自己的时间窗（在 t 上错峰；t 是段内进度 0..1）
      const win = (a, b, easeName = 'inOutCubic') => ease[easeName](prog(t, a, b));

      lines.begin();
      // ① 标题下的手写下划线：两笔（主笔 + 收笔的一个小回勾）
      const titleY = Math.round(H * 0.215);
      const ulY = titleY + Math.round(H * 0.035);
      strokePath(lines, [[bx + 8, ulY], [bx + bw * 0.34, ulY - 5], [bx + bw * 0.62, ulY + 2]],
        { width: 7, color: this.ink, reveal: win(0.02, 0.30), boil });
      strokePath(lines, [[bx + bw * 0.64, ulY + 1], [bx + bw * 0.80, ulY - 3], [bx + bw * 0.90, ulY + 3]],
        { width: 5, color: this.inkSoft, reveal: win(0.28, 0.42), boil, seed: (o.seed ?? 0) + 5 });

      // ② 一个手画的框（闭合路径：首尾相接、不加圆头），略微过冲（手画框总是多走一点）
      const fx = bx + Math.round(bw * 0.05);
      const fy = by + Math.round(bh * 0.10);
      const fw = Math.round(bw * 0.40);
      const fh = Math.round(bh * 0.62);
      const box = [];
      const over = 14;
      const seg = 9;
      for (let i = 0; i <= seg; i++) box.push([fx + (fw + over) * (i / seg), fy]);
      for (let i = 0; i <= seg; i++) box.push([fx + fw, fy + (fh + over) * (i / seg)]);
      for (let i = 0; i <= seg; i++) box.push([fx + fw - (fw + over) * (i / seg), fy + fh]);
      for (let i = 0; i <= seg; i++) box.push([fx, fy + fh - (fh + over) * (i / seg)]);
      strokePath(lines, box, { width: 5, color: this.inkMid, reveal: win(0.34, 0.66, 'outCubic'), boil,
        seed: (o.seed ?? 0) + 10 });

      // ③ 框里的一根「生长曲线」：手画的，不是折线图（带 3 个手点刻度）
      const c0x = fx + Math.round(fw * 0.12);
      const c0y = fy + Math.round(fh * 0.80);
      const c1x = fx + Math.round(fw * 0.88);
      const c1y = fy + Math.round(fh * 0.18);
      const curve = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        // 一条「先慢后快」的手画曲线：下凹起步、末端上扬，而且不是完美的平滑函数
        const x = c0x + (c1x - c0x) * u;
        const y = c0y - (c0y - c1y) * Math.pow(u, 2.1) - Math.sin(u * 9.2) * Math.round(fh * 0.018);
        curve.push([x, y]);
      }
      strokePath(lines, curve, { width: 8, color: this.ink, reveal: win(0.62, 0.82), boil,
        seed: (o.seed ?? 0) + 20 });
      for (let i = 1; i <= 3; i++) {
        const u = i / 4;
        const x = c0x + (c1x - c0x) * u;
        const y = c0y - (c0y - c1y) * Math.pow(u, 2.1);
        const k = win(0.80 + i * 0.04, 0.88 + i * 0.04);
        strokePath(lines, [[x, y], [x + 2, y + Math.round(fh * 0.09)]],
          { width: 4, color: this.inkSoft, reveal: k, boil, seed: (o.seed ?? 0) + 30 + i, smooth: false });
      }

      // ④ 右边一块「圈出来的重点」：手画的圈（过冲收口）
      const kx = bx + Math.round(bw * 0.62);
      const ky = by + Math.round(bh * 0.42);
      const kr = Math.round(bh * 0.26);
      strokeArc(lines, { cx: kx + kr, cy: ky, rx: kr * 1.06, ry: kr * 0.86, rot: -0.12,
        overshoot: 0.14 }, { width: 6, color: this.inkSig, reveal: win(0.86, 1.02), boil,
        seed: (o.seed ?? 0) + 40 });

      // ⑤ 一根从框指向圈的手画箭头（箭杆 + 两撇箭头）
      const ax0 = fx + fw + 26;
      const ay0 = fy + Math.round(fh * 0.58);
      const ax1 = kx - 18;
      const ay1 = ky + Math.round(kr * 0.30);
      const kArr = win(0.70, 0.86);
      strokePath(lines, [[ax0, ay0], [(ax0 + ax1) * 0.5, (ay0 + ay1) * 0.5 - 18], [ax1, ay1]],
        { width: 5, color: this.inkMid, reveal: kArr, boil, seed: (o.seed ?? 0) + 50 });
      if (kArr > 0) {
        strokePath(lines, [[ax1, ay1], [ax1 - 22, ay1 - 12]],
          { width: 4, color: this.inkMid, reveal: sat(kArr * 1.25), boil,
            seed: (o.seed ?? 0) + 60, smooth: false });
        strokePath(lines, [[ax1, ay1], [ax1 - 20, ay1 + 14]],
          { width: 4, color: this.inkMid, reveal: sat(kArr * 1.25), boil,
            seed: (o.seed ?? 0) + 70, smooth: false });
      }
      lines.flush(ctx.out);

      // ⑥ 文字：眉标（等宽小字）+ 手写风格的标题 + 副标 + 页脚
      text.clear();
      const tokens = ctx.style?.tokens ?? {};
      const hero = Math.round((resolveTypeSize('hero', tokens) ?? 136) * 0.72);
      type.write(String(o.kicker ?? ''), bx, top, {
        size: 22, family: 'mono', tracking: 6, color: css(this.inkSoft), t: tt - 0.1,
      });
      type.writeLine(String(o.title ?? ''), bx + 6, titleY, {
        size: hero, weight: 700, family: HAND,
        color: css(this.ink),
        stagger: 0.06, staggerDur: 0.5, from: 'none',
        t: tt - 0.35,
      });
      // ⚠ 副标与**手写下划线**的基线要对开：两者都落在页眉带里时，副标会被下划线穿过
      //   （第一版写在 `ulY + 2`，正好压在下划线上 —— 接触表一眼就能看到「字被划掉了」）。
      //   这里移到标题的基线上（右侧、同一条基线），下划线留在它下面 38px。
      type.writeLine(String(o.sub ?? ''), bx + Math.round(bw * 0.66), titleY, {
        size: Math.max(24, Math.round(hero * 0.20)), family: HAND,
        color: css(this.inkMid),
        alpha: [0, 1], t: tt - 1.15,
      });
      // 圈里的「重点词」：写进文字层（笔画太细的字用笔迹画会糊成一团）
      type.writeLine('重点', kx + kr, ky + 2, {
        size: Math.round(hero * 0.30), weight: 700, family: HAND,
        color: css(this.inkSig), anchor: 'center',
        alpha: [0, 1], t: tt - 1.45,
      });
      type.write(String(o.footer ?? ''), bx, foot, {
        size: 24, family: 'mono', color: css(this.inkSoft), t: tt - 1.7,
      });
      text.upload();
      comp.draw(gl, text, ctx.out, { premult: false });

      // 浅底前的一点点光：亮度收在 1 附近（浅底最怕泛光，一泛就糊成一片白）
      return {
        bloom: 0.05, bloomThreshold: 1.5, halation: 0.04,
        grain: 0.028, vignette: 0.24, shoulder: 0.99, contrast: 1.02, saturation: 0.96,
      };
    },
  };
}

handwriteShot.defaults = DEFAULTS;
handwriteShot.meta = {
  name: 'handwrite',
  summary: '手写讲解：白板/纸上，一笔一笔按弧长生长出来（落笔细、行笔粗、收笔细），每 2 帧重描一次，标题用手写体压上来。',
  notes: '几何层在 src/kit/stroke.js（中心线 + 压力 -> 轮廓多边形 + 圆头，走 fillPoly）。'
    + '与 `cel` 的差别是**宽度沿弧长变化**：cel 只有抖动、没有笔压；与 `lineart` 的差别是它讲「写」而不是讲「顺序」。'
    + '`mode: paper` 换成笔记本（暖纸 + 横格线 + 左边红边线）；`boil` 是重描抖动幅度（0 = 一笔画完）。'
    + '中文标题用手写体栈（楷体优先；FAMILIES 里没有的名字会原样当 CSS 字体栈用）。',
  use: '白板讲解 / 纸感手写笔记 / 「这件事是一笔一笔写出来的」',
  energy: '中低',
  avoid: '要读精确读数或大段正文时（手写体与笔压会吃掉小字）；要「印刷品」用风格包的 view',
  params: [
    { name: 'id', type: 'string', desc: '段名（HUD / --only / 报错里用它）' },
    { name: 'kicker', type: 'string', desc: '左上眉标（等宽小字）' },
    { name: 'title', type: 'string', desc: '主标题（手写体栈，中文可用）' },
    { name: 'sub', type: 'string', desc: '标题右侧的副标（手写体小字）' },
    { name: 'footer', type: 'string', desc: '底部一行（页脚带里，最后淡入；空串则不画）' },
    { name: 'mode', type: 'string', desc: 'whiteboard（默认，冷白板）/ paper（暖纸 + 横格线）' },
    { name: 'seed', type: 'number', desc: '笔迹噪声 / 抖动的种子（同一个 seed 画面逐像素相同）' },
    { name: 'boil', type: 'number', desc: '重描抖动幅度（逻辑像素；默认 1.4，0 = 一笔画完不抖）' },
  ],
};

/**
 * 声明式 spec（docs/ENGINE.md §14.9）。
 *
 * requires: [] —— 只读 f.p / f.lt / f.t 与参数；背景由本段自己的 Pass 铺满整帧。
 * outputs.visual = 'full-frame' —— 白板/纸底整帧覆盖。
 */
handwriteShot.spec = {
  params: {
    id: 'string', kicker: 'string', title: 'string', sub: 'string', footer: 'string',
    mode: 'string', seed: 'number', boil: 'number',
  },
  requires: [],
  outputs: { visual: 'full-frame', handlesTransition: false },
};