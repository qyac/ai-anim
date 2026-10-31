#!/usr/bin/env node
// @ts-check
/**
 * **剪纸 / 纸艺层叠**（`src/kit/paper.js`）—— 离线单测。不需要 GPU / 浏览器 / Vite：
 *
 *   node tools/test-paper.mjs
 *
 * 钉的是 BACKLOG **1-49** 能力缺口表第 5 行（覆盖素材包 20 条）。真正难的不是行数，
 * 而是**三个只有出图才看得出来的比例** —— 所以这份单测把它们变成断言：
 *
 *   ① **撕边采样密度必须跟边长走**：第一版默认 40 个点，2040px 的边每 51px 才一个点，
 *      而小尺度毛刺周期 ≈ 边长/roughFreq ≈ 78px ⇒ 毛刺被折线**抹平**，出图是一条近乎笔直的边。
 *   ② **白芯只能浅一点点**：第一版提亮 35%，出图是一条雪白高光带（读起来像贴纸白边）。
 *      真实纸芯只浅 5–9%。
 *   ③ **投影必须不透明**（被压住那层乘暗），不能半透明黑 —— `lines` 的柔边在相邻扫描行
 *      之间会叠加，半透明填充会出现横向条纹。
 *
 * 另外证三件结构性的事：撕边**只吃 seed 不吃 t**、层栈**由远到近**画（线段批没有 z-test）、
 * 形状平移**不改原对象**（否则偏移每帧累积）。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  tornEdge, paperShape, paperFace, paperStack, paperGrain,
  shadowColor, coreColorOf, translateShape,
} from '../src/kit/paper.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
const failed = [];
function t(name, fn) {
  try { fn(); passed++; }
  catch (err) {
    failed.push('  x ' + name + '\n      '
      + String(err && err.message ? err.message : err).split('\n').join('\n      '));
  }
}

/** 记下 fillPoly / polyline 调用顺序的假 lines（够 paperStack / paperFace 用）。 */
function fakeLines() {
  const calls = [];
  return {
    calls,
    fillPoly(pts, color, step) { calls.push({ kind: 'fill', n: pts.length, color, step }); },
    polyline(pts, w, color, closed) { calls.push({ kind: 'stroke', n: pts.length, color, closed }); },
  };
}

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

/* ═══════ 1. tornEdge：分形撕边的几何 ═══════ */

t('tornEdge 两端收敛到基线上（撕边从纸的边缘起头，不是凭空鼓起来）', () => {
  const e = tornEdge({ x0: 0, y0: 0, x1: 400, y1: 0, amp: 30, seed: 3 });
  const first = e.pts[0];
  const last = e.pts[e.pts.length - 1];
  assert.ok(near(first[0], 0, 1e-6) && near(first[1], 0, 1e-6), '起点不在基线上');
  assert.ok(near(last[0], 400, 1e-6) && near(last[1], 0, 1e-6), '终点不在基线上');
});

t('tornEdge 中段真的偏离了基线（不是一条直线）', () => {
  const e = tornEdge({ x0: 0, y0: 0, x1: 400, y1: 0, amp: 30, rough: 6, seed: 3 });
  const offs = e.pts.map((p) => p[1]);
  const span = Math.max(...offs) - Math.min(...offs);
  assert.ok(span > 6, '偏离跨度只有 ' + span.toFixed(2) + 'px —— 撕边太平了');
});

t('tornEdge 的起伏是分形的：相邻点跳变远小于总跨度（否则是白噪声线）', () => {
  const e = tornEdge({ x0: 0, y0: 0, x1: 2040, y1: 0, amp: 40, rough: 14, roughFreq: 14, seed: 5 });
  const offs = e.pts.map((p) => p[1]);
  const span = Math.max(...offs) - Math.min(...offs);
  let maxJump = 0;
  for (let i = 1; i < offs.length; i++) maxJump = Math.max(maxJump, Math.abs(offs[i] - offs[i - 1]));
  assert.ok(maxJump < span * 0.35,
    '相邻点最大跳变 ' + maxJump.toFixed(2) + ' vs 总跨度 ' + span.toFixed(2) + ' —— 这是白噪声不是撕边');
});

t('tornEdge 只吃 seed 不吃 t：同 seed 两次调用逐点相同（纸不会每帧重撕）', () => {
  const o = { x0: 10, y0: 20, x1: 500, y1: 20, amp: 20, seed: 7 };
  assert.deepEqual(tornEdge(o).pts, tornEdge(o).pts);
  assert.notDeepEqual(tornEdge(o).pts, tornEdge({ ...o, seed: 8 }).pts, '换 seed 必须换形状');
});

t('tornEdge 的法线是单位向量且垂直于基线', () => {
  const e = tornEdge({ x0: 0, y0: 0, x1: 100, y1: 0, seed: 1 });
  assert.ok(near(Math.hypot(e.normal[0], e.normal[1]), 1, 1e-9));
  assert.ok(near(e.normal[0] * 100, 0, 1e-6), '法线不垂直于基线');
});

/* ═══════ 2. paperShape：采样密度与白芯 ═══════ */

t('采样密度跟边长走：2040x920 的纸至少 200 个轮廓点（默认 ~8px 一个点）', () => {
  const s = paperShape({ x: 0, y: 0, w: 2040, h: 920, seed: 11 });
  assert.ok(s.outer.length >= 200,
    '2040x920 的纸只有 ' + s.outer.length + ' 个轮廓点 —— 撕边会被 fillPoly 抹平');
});

t('显式 steps 会被尊重（想降低精度时写得出来）', () => {
  const few = paperShape({ x: 0, y: 0, w: 800, h: 200, seed: 1, steps: 12 });
  const many = paperShape({ x: 0, y: 0, w: 800, h: 200, seed: 1, steps: 120 });
  assert.ok(many.outer.length > few.outer.length * 3,
    'steps 没生效：12 => ' + few.outer.length + ' 点，120 => ' + many.outer.length + ' 点');
});

t('paperShape 的 outer / inner 点数相同（内轮廓是内缩版，不是另画一个）', () => {
  const s = paperShape({ x: 100, y: 100, w: 600, h: 400, seed: 2, core: 6 });
  assert.equal(s.outer.length, s.inner.length);
  assert.ok(s.outer.length > 8);
});

t('inner 真的在 outer 里面（每个点都比对应点更靠近中心）', () => {
  const x = 100, y = 100, w = 600, h = 400;
  const s = paperShape({ x, y, w, h, seed: 2, core: 8 });
  const mx = x + w / 2, my = y + h / 2;
  for (let i = 0; i < s.outer.length; i++) {
    const dOut = Math.hypot(s.outer[i][0] - mx, s.outer[i][1] - my);
    const dIn = Math.hypot(s.inner[i][0] - mx, s.inner[i][1] - my);
    assert.ok(dIn <= dOut + 1e-9, '第 ' + i + ' 个点内缩之后反而更靠外了');
  }
});

t('core = 0 时 inner 等于 outer（白芯宽度可以关掉）', () => {
  const s = paperShape({ x: 0, y: 0, w: 300, h: 300, seed: 4, core: 0 });
  assert.deepEqual(s.outer, s.inner);
});

t('白芯只浅 5-9%：coreColorOf 默认落在 [1.03, 1.12]（第一版 1.35 => 雪白高光带）', () => {
  const base = [0.5, 0.5, 0.5];
  const ratio = coreColorOf(base)[0] / base[0];
  assert.ok(ratio >= 1.03 && ratio <= 1.12,
    '白芯提亮 ' + ratio.toFixed(2) + 'x —— 超出 [1.03, 1.12]（太大就不像纸，像贴纸白边）');
});

t('白芯不会超过 1（饱和之后夹回，别指望纸能发光）', () => {
  for (const v of coreColorOf([0.99, 0.99, 0.99])) assert.ok(v <= 1 + 1e-9, '白芯色 ' + v + ' 超过 1');
});

/* ═══════ 3. shadowColor：投影必须不透明 ═══════ */

t('shadowColor 返回三通道（不透明）—— 半透明填充会在扫描行之间出条纹', () => {
  const c = shadowColor([0.8, 0.7, 0.6], 0.5);
  assert.equal(c.length, 3, '投影色必须是 RGB（4 通道 = 带 alpha = 会叠条纹）');
  assert.ok(near(c[0], 0.4) && near(c[1], 0.35) && near(c[2], 0.3));
});

t('shadowColor 的 amount 被夹到 0..1（传 2 或 -1 不会出现发光/负色）', () => {
  assert.deepEqual(shadowColor([0.5, 0.5, 0.5], 2), [0.5, 0.5, 0.5]);
  assert.deepEqual(shadowColor([0.5, 0.5, 0.5], -1), [0, 0, 0]);
});
/* ═══════ 4. paperGrain：纤维 ═══════ */

t('paperGrain 只吃坐标：同入参两次调用结果相同（纤维不会动）', () => {
  const a = paperGrain([0.5, 0.4, 0.3], 12, 34, { seed: 2 });
  assert.deepEqual(a, paperGrain([0.5, 0.4, 0.3], 12, 34, { seed: 2 }));
});

t('paperGrain 的幅度受 amp 限制（默认 +-2.5%，别把纸弄脏）', () => {
  for (let i = 0; i < 60; i++) {
    const g = paperGrain([1, 1, 1], i * 37, i * 91, { amp: 0.025 });
    assert.ok(g[0] >= 0.97 && g[0] <= 1.03,
      '纤维把明度拉到了 ' + g[0].toFixed(3) + '（应该在 1 +- 0.03 之内）');
  }
});

/* ═══════ 5. translateShape：不改原对象 ═══════ */

t('translateShape 返回新对象，原形状一点不动（否则层栈每帧累加偏移）', () => {
  const s = paperShape({ x: 0, y: 0, w: 200, h: 200, seed: 1, steps: 16 });
  const before = JSON.stringify(s);
  const moved = translateShape(s, 50, -30);
  assert.equal(JSON.stringify(s), before, '原形状被改了');
  assert.ok(near(moved.outer[0][0], s.outer[0][0] + 50));
  assert.ok(near(moved.outer[0][1], s.outer[0][1] - 30));
  assert.equal(moved.outer.length, s.outer.length);
  assert.equal(moved.inner.length, s.inner.length);
});

/* ═══════ 6. paperStack：层序与 pan 线性 ═══════ */

t('paperStack 由远到近画（先 fill 的是最深那层）—— 线段批没有 z-test', () => {
  const mk = (seed, color) => ({
    shape: paperShape({ x: 0, y: 0, w: 100, h: 100, seed, steps: 8 }),
    color,
  });
  const L2 = fakeLines();
  paperStack(L2, [
    { ...mk(1, [0.2, 0.2, 0.2]), depth: 1 },
    { ...mk(2, [0.5, 0.5, 0.5]), depth: 0 },
  ], { step: 10 });
  const fills = L2.calls.filter((c) => c.kind === 'fill');
  assert.ok(fills.length >= 4, '每层至少要有 投影 + 纸 + 白芯 三笔填充');
  const firstShadow = fills[0].color;
  assert.ok(firstShadow[0] > 0.1 && firstShadow[0] < 0.5,
    '第一笔投影的亮度 ' + firstShadow[0] + ' 不对（应该来自 depth=0 那层）');
});

t('paperStack 的 pan 是线性的：pan 翻倍 => 纸的位移翻倍（调用方要能算成 t 的函数）', () => {
  const s = paperShape({ x: 0, y: 0, w: 100, h: 100, seed: 1, steps: 8 });
  const capture = () => {
    const seen = [];
    return {
      seen,
      L: { fillPoly(pts) { seen.push(pts[0].slice()); }, polyline() {} },
    };
  };
  const a = capture();
  paperStack(a.L, [{ shape: s, color: [0.5, 0.5, 0.5], depth: 1 }], { pan: [10, 0], step: 10 });
  const b = capture();
  paperStack(b.L, [{ shape: s, color: [0.5, 0.5, 0.5], depth: 1 }], { pan: [20, 0], step: 10 });
  const d1 = a.seen[1][0] - s.outer[0][0];
  const d2 = b.seen[1][0] - s.outer[0][0];
  assert.ok(near(d2, d1 * 2, 1e-6), 'pan 20 的位移 ' + d2 + ' 不是 pan 10 的 ' + d1 + ' 的两倍');
});

/* ═══════ 7. paperFace：顺序与可选笔数 ═══════ */

t('paperFace：给了 shadow 就先画投影，没给就只画纸 + 白芯', () => {
  const s = paperShape({ x: 0, y: 0, w: 100, h: 100, seed: 1, steps: 8 });
  const a = fakeLines();
  paperFace(a, s, { color: [0.5, 0.5, 0.5] });
  assert.equal(a.calls.filter((c) => c.kind === 'fill').length, 2, '不传 shadow 时应该只有两笔');
  const b = fakeLines();
  paperFace(b, s, { color: [0.5, 0.5, 0.5], shadow: [0.1, 0.1, 0.1] });
  assert.equal(b.calls.filter((c) => c.kind === 'fill').length, 3, '传 shadow 时应该三笔');
  assert.deepEqual(b.calls[0].color, [0.1, 0.1, 0.1], '投影必须画在最前面（下面是纸）');
});

t('paperFace 的 edge 只在传了才描边（每层都描边 = 贴纸拼贴，不是剪纸）', () => {
  const s = paperShape({ x: 0, y: 0, w: 100, h: 100, seed: 1, steps: 8 });
  const a = fakeLines();
  paperFace(a, s, { color: [0.5, 0.5, 0.5] });
  assert.equal(a.calls.filter((c) => c.kind === 'stroke').length, 0);
  const b = fakeLines();
  paperFace(b, s, { color: [0.5, 0.5, 0.5], edge: [0.2, 0.2, 0.2] });
  assert.equal(b.calls.filter((c) => c.kind === 'stroke').length, 1);
});

/* ═══════ 8. 接线自检 ═══════ */

t('kit/index.js 转发了全部 8 个函数', () => {
  const idx = read('src/kit/index.js');
  const fns = ['tornEdge', 'paperShape', 'paperFace', 'paperStack', 'paperGrain',
    'shadowColor', 'coreColorOf', 'translateShape'];
  for (const fn of fns) {
    assert.ok(idx.includes(fn), 'kit/index.js 没导出 ' + fn);
  }
});

t('regress-all 挂上了这条回归（加测试只改清单，不要改 verify.yml）', () => {
  assert.ok(read('tools/regress-all.mjs').includes('test-paper.mjs'),
    'regress-all.mjs 里没有 test-paper');
});

t('AGENTS.md 点了名（不然这套东西没人知道存在）', () => {
  assert.ok(/paperShape|paperStack|纸艺/.test(read('AGENTS.md')), 'AGENTS.md 里没提纸艺');
});

/* ═══════ 汇总 ═══════ */

if (failed.length) {
  console.log('test-paper: ' + passed + ' 项通过，' + failed.length + ' 项失败');
  for (const f of failed) console.log(f);
  process.exit(1);
}
console.log('test-paper: ' + passed + ' 项通过');
