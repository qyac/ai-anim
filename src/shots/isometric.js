// @ts-check
/**
 * 镜头模板：`isometric` —— **等距 2.5D 体块**：一格格方块从地面长起来，按距离从远到近叠。
 *
 * 为什么用代码而不是 3D 工具：这类画面是**刚性、可重复**的 ——
 * 位置能用公式写出来（`gx/gy/gz` → 屏幕 xy），没有任何"必须像动物一样运动"的东西。
 * 用代码生成，几何描述比渲染结果还短，而且确定性、能 seek、能并行子帧。
 *
 * 三条实现纪律：
 *   · **画家算法**：线段批没有 z-test，必须按 `gx + gy + gz` 从远到近排（远的先画）；
 *   · **每个盒子只画朝镜头的 3 个面**（顶 + 左 + 右）—— 等价于背面剔除；
 *   · **不做累积**：高度、落位、浮动全部是 `f.lt` 的纯函数（`prog` / `spring`）。
 *
 * ```js
 * export default shot('isometric', { title: '让城市长起来', cols: 7, rows: 5 });
 * ```
 */

import { Pass } from '../core/gl.js';
import { css, prog, sat, clamp, mixColor, spring, rng } from '../core/util.js';
import { resolveTypeSize } from '../style/tokens.js';

/** 等距投影：`gx/gy` 是地面网格坐标，`gz` 是高度（0 = 地面）。2:1 等距（30°）。 */
const ISO = { cx: 0.866, cy: 0.5 };
const isoX = (gx, gy) => (gx - gy) * ISO.cx;
const isoY = (gx, gy, gz) => (gx + gy) * ISO.cy - gz;

const DEFAULTS = {
  id: 'isometric',
  kicker: 'ISOMETRIC / 让城市长起来',
  title: '一格一格长出来',
  sub: '等距 2.5D · 同一个公式画完',
  cols: 7,
  rows: 5,
  cell: 78,
  height: 150,
  footer: '没有 z-buffer：远的先画，只画朝镜头的三个面',
};

export function isometricShot(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const cols = clamp(Math.round(o.cols), 2, 12);
  const rows = clamp(Math.round(o.rows), 2, 9);

  // 每格的"高度倍数"用确定性噪声预计算（setup 里一次算好，render 只读）
  const heights = [];
  {
    const r = rng(0x1507);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) heights.push(0.25 + r() * 0.95);
  }

  return {
    id: o.id,

    setup(ctx) {
      const P = ctx.P;
      // 整帧底色 + 一道很淡的地平线光晕：等距画面最怕"飘在虚空里"
      this.bg = new Pass(ctx.gl, /* glsl */ `
        uniform vec3 cInk, cInk2;
        uniform float vig;
        void main() {
          vec2 p = vUv;
          vec3 col = mix(cInk2, cInk, smoothstep(0.0, 1.0, p.y));
          col *= 1.0 - vig * smoothstep(0.35, 1.15, length((p - 0.5) * vec2(1.0, 1.04)) * 1.6);
          fragColor = vec4(col, 1.0);
        }`, { cInk: P.ink, cInk2: P.ink2, vig: 0.42 }, { key: 'shot_iso_bg', blend: false });
    },

    render(ctx) {
      const { f, gl, P, lines, text, type, comp, W, H } = ctx;
      const t = f.lt;
      this.bg.render(gl, ctx.out, t, f.dt);

      const cx = W * 0.5, cy = H * 0.60;
      const cell = o.cell * Math.min(1, W / 1920);
      // 三个面必须拉开明暗，否则在浅底风格里整块糊成一片（实测：0.22/0.10/0.04 几乎同色）
      const top = mixColor(P.ink, P.bone, 0.34);
      const left = mixColor(P.ink, P.graphite, 0.62);
      const right = mixColor(P.ink, P.graphite, 0.38);
      const edge = [P.signal[0], P.signal[1], P.signal[2], 0.55];

      lines.begin();
      // 地面网格：先铺一层很淡的等距网（画面"落地"）
      for (let y = 0; y <= rows; y++) {
        const p0 = [cx + isoX(0, y) * cell, cy + isoY(0, y, 0) * cell];
        const p1 = [cx + isoX(cols, y) * cell, cy + isoY(cols, y, 0) * cell];
        lines.seg(p0[0], p0[1], p1[0], p1[1], 1.2, [P.bone[0], P.bone[1], P.bone[2], 0.06]);
      }
      for (let x = 0; x <= cols; x++) {
        const p0 = [cx + isoX(x, 0) * cell, cy + isoY(x, 0, 0) * cell];
        const p1 = [cx + isoX(x, rows) * cell, cy + isoY(x, rows, 0) * cell];
        lines.seg(p0[0], p0[1], p1[0], p1[1], 1.2, [P.bone[0], P.bone[1], P.bone[2], 0.06]);
      }

      // 体块：地面菱形 N/E/S/W → 顶面整体上移 h；**远的先画**（画家算法）
      const blocks = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const hMul = heights[y * cols + x];
          const delay = 0.25 + ((x + y) / (cols + rows)) * 1.9;
          const k = sat(spring(Math.max(0, t - delay)));
          const rise = k * hMul * o.height;
          if (rise < 2) continue;
          const breathe = 1 + 0.012 * Math.sin(t * 1.1 + (x * 0.7 + y * 0.9));
          blocks.push({ x, y, h: rise * breathe, depth: x + y });
        }
      }
      blocks.sort((a, b) => a.depth - b.depth);
      for (const b of blocks) {
        const { x, y, h } = b;
        const bx = cx + isoX(x, y) * cell;
        const by = cy + isoY(x, y, 0) * cell;
        const dx = cell * 0.5;          // 菱形水平半宽
        const dy = cell * 0.25;         // 菱形垂直半高（2:1 等距）
        // 地面（底面）四个角
        const N = [bx, by - dy], E = [bx + dx, by], S = [bx, by + dy], W = [bx - dx, by];
        // 顶面 = 底面上移 h
        const Nt = [N[0], N[1] - h], Et = [E[0], E[1] - h], St = [S[0], S[1] - h], Wt = [W[0], W[1] - h];
        // 左面（Wt, St, S, W）与右面（St, Et, E, S）
        quadFill(lines, Wt, St, S, W, left);
        quadFill(lines, St, Et, E, S, right);
        // 顶面（菱形）
        triFill(lines, Nt, Et, St, top);
        triFill(lines, Nt, St, Wt, top);
        // 棱线：顶面一周 + 两条竖棱（信号色）
        lines.seg(Nt[0], Nt[1], Et[0], Et[1], 1.5, edge);
        lines.seg(Nt[0], Nt[1], Wt[0], Wt[1], 1.5, edge);
        lines.seg(Wt[0], Wt[1], Et[0], Et[1], 1.2, [P.bone[0], P.bone[1], P.bone[2], 0.10]);
        lines.seg(St[0], St[1], Wt[0], Wt[1], 1.5, edge);
        lines.seg(St[0], St[1], Et[0], Et[1], 1.5, edge);
      }
      lines.flush(ctx.out);

      text.clear();
      const hero = resolveTypeSize('h1', ctx.style?.tokens ?? null) ?? 96;
      type.write(o.kicker, W * 0.06, H * 0.10, { size: 22, weight: 700, family: 'mono', color: css(P.ash), t: t - 0.1 });
      type.write(o.title, W * 0.06, H * 0.17, { size: Math.round(hero * 0.92), weight: 800, family: 'sans', color: css(P.bone), t: t - 0.3, stagger: 0.03, from: 'up', dist: 22 });
      type.write(o.sub, W * 0.06, H * 0.17 + Math.round(hero * 0.92) * 0.72, { size: 26, weight: 500, family: 'mono', color: css(P.ash), t: t - 0.5 });
      type.write(o.footer, W * 0.06, H - 62, { size: 20, weight: 500, family: 'mono', color: css(P.graphite), t: t - 0.8 });
      text.upload();
      comp.draw(gl, text, ctx.out, { premult: false });
      return { bloom: 0.22, grain: 0.02 };
    },
  };
}

/** 四边形填充 = 两个三角形（线段批没有多边形，靠平行扫线） */
function quadFill(lines, a, b, c, d, color) {
  triFill(lines, a, b, c, color);
  triFill(lines, a, c, d, color);
}

/** 三角形填充（线段批没有多边形，用一排平行细线扫出来；不透明色，避免柔边叠加） */
function triFill(lines, a, b, c, color) {
  const ys = [a[1], b[1], c[1]];
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const step = 2;
  const n = Math.max(1, Math.ceil((y1 - y0) / step));
  const edgeX = (p, q, y) => {
    if (Math.abs(q[1] - p[1]) < 1e-6) return null;
    const k = (y - p[1]) / (q[1] - p[1]);
    if (k < 0 || k > 1) return null;
    return p[0] + (q[0] - p[0]) * k;
  };
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    const xs = [edgeX(a, b, y), edgeX(b, c, y), edgeX(c, a, y)].filter((v) => v != null);
    if (xs.length < 2) continue;
    const lo = Math.min(...xs), hi = Math.max(...xs);
    if (hi - lo < 0.6) continue;
    lines.seg(lo, y, hi, y, 2.4, color);
  }
}

isometricShot.defaults = DEFAULTS;
isometricShot.meta = {
  label: '等距 2.5D',
  note: '一格格方块从地面长起来，按 gx+gy+gz 从远到近画（画家算法）。刚性几何，纯代码生成。',
  energy: '中',
  use: '讲"长出来 / 搭起来 / 一层层堆"—— 城市、模块、积木、架构',
  avoid: '需要真遮挡、材质光照、成百上千实例时（那种用 makeThreeShot）',
  params: [
    { name: 'id', type: 'string', desc: '段名' },
    { name: 'kicker', type: 'string', desc: '左上眉标' },
    { name: 'title', type: 'string', desc: '主标题' },
    { name: 'sub', type: 'string', desc: '副标（等宽）' },
    { name: 'cols', type: 'number', desc: '地面格数（x 方向）' },
    { name: 'rows', type: 'number', desc: '地面格数（y 方向）' },
    { name: 'cell', type: 'number', desc: '单格像素宽' },
    { name: 'height', type: 'number', desc: '体块最大高度（像素）' },
    { name: 'footer', type: 'string', desc: '底部一行' },
  ],
};

isometricShot.spec = {
  params: {
    id: 'string', kicker: 'string', title: 'string', sub: 'string',
    cols: 'number', rows: 'number', cell: 'number', height: 'number', footer: 'string',
  },
  requires: [],
  outputs: { visual: 'full-frame', handlesTransition: false },
};