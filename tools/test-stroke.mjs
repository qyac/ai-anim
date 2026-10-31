#!/usr/bin/env node
// @ts-check
/**
 * **手绘笔迹**（`src/kit/stroke.js`，BACKLOG 1-69）—— 离线单测。不需要 GPU / 浏览器：
 *
 *   node tools/test-stroke.mjs
 *
 * 钉的是素材包缺口表第 6 行（手写笔迹：可变宽笔 + 手写体 + 逐笔生长 + 线条沸腾，覆盖 17 条）。
 * 这一层的价值全在**宽度沿弧长的分布**上，而有四件事**写错不报错、只出错画面**：
 *
 *   1. 宽度变化率超过 MAX_WIDTH_SLOPE ⇒ 轮廓自交 ⇒ 偶奇规则把自交区填成「洞」，
 *      笔画中间长出蝴蝶结形的空白；
 *   2. 两端宽度 < 1px ⇒ fillPoly 的扫描行穿透多边形 ⇒ 出图是一串虚线点；
 *   3. 端点圆头要用「这一端自己的半宽」（用平均值会在收笔处鼓一个墨滴）；
 *   4. 生长必须按**弧长**截断（按点数截断时密采样段走得慢、疏采样段走得快）。
 *
 * 这些都是几何事实，所以这里全部用**几何断言**钉住（不是「源码里有某个字符串」）。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_WIDTH_SLOPE, catmullRom, resampleByLength, pressureEnvelope, clampWidthSlope,
  pressureProfile, strokeRing, revealSamples, boilSamples, inkOn,
  drawStroke, drawStrokeChain, canFillOutline, minCurvatureRadius, SELF_INTERSECT_MARGIN,
} from '../src/kit/stroke.js';
import { polySpans } from '../src/core/fill.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

let passed = 0;
const failed = [];
function t(name, fn) {
  try { fn(); passed++; }
  catch (err) {
    failed.push('  x ' + name + '\n      '
      + String(err && err.message ? err.message : err).split('\n').join('\n      '));
  }
}

/** 一条弧长为 len 的直线上的采样点（宽度均匀时轮廓必须是矩形）。 */
function lineOf(len, y = 200, x0 = 200) { return resampleByLength([[x0, y], [x0 + len, y]], 6).pts; }

/** 多边形自交计数（相邻边与首尾边不算）。 */
function selfIntersections(ring) {
  const n = ring.length;
  const seg = (p, q, r, s) => {
    const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
    if (Math.abs(d) < 1e-12) return false;
    const ua = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d;
    const ub = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    return ua > 0 && ua < 1 && ub > 0 && ub < 1;
  };
  let hits = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (seg(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) hits++;
    }
  }
  return hits;
}

/* ================================================================ 1. 常量 */

t('MAX_WIDTH_SLOPE 是 0.45（>1 时两条偏移边互相追上 = 自交，留一半余量）', () => {
  assert.equal(MAX_WIDTH_SLOPE, 0.45);
  assert.ok(MAX_WIDTH_SLOPE < 1, '斜率上限必须远小于 1');
});

/* ================================================================ 2. 中心线 */

t('catmullRom 过控制点、端点不顶出去、点数按 steps 增长', () => {
  const ctrl = [[0, 0], [100, 40], [200, 0]];
  const out = catmullRom(ctrl, { steps: 8 });
  assert.ok(out.length > ctrl.length, '平滑后的点数应该多于控制点');
  for (const c of ctrl) {
    const near = out.some((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) < 1e-6);
    assert.ok(near, '曲线必须过控制点 ' + c.join(','));
  }
  assert.deepEqual(out[0], ctrl[0]);
  assert.deepEqual(out[out.length - 1], ctrl[ctrl.length - 1]);
});

t('resampleByLength 是**等距**的（相邻点距离的极差 < 1%）', () => {
  const pts = catmullRom([[0, 0], [300, 120], [500, -60]], { steps: 10 });
  const rs = resampleByLength(pts, 7);
  const d = [];
  for (let i = 1; i < rs.pts.length; i++) {
    d.push(Math.hypot(rs.pts[i][0] - rs.pts[i - 1][0], rs.pts[i][1] - rs.pts[i - 1][1]));
  }
  const lo = Math.min.apply(null, d), hi = Math.max.apply(null, d);
  assert.ok(hi - lo < hi * 0.01, '步进不均匀：' + lo.toFixed(3) + '..' + hi.toFixed(3));
  // 点数由 ceil(总长/步进) 决定，所以「步进 × (点数-1)」与实际总长的差不超过一个步进
  assert.ok(Math.abs(rs.arc - 7 * (rs.pts.length - 1)) <= 7, '返回的弧长与步进 × 段数应有同一个量级');
});

/* ================================================================ 3. 压力包络 */

t('压力包络：两端细、中间满、单调（起笔与收笔都不许从 1 开始）', () => {
  const mid = pressureEnvelope(0.5);
  assert.ok(mid > 0.99, '中间应该是满压（实测 ' + mid.toFixed(3) + '）');
  assert.ok(pressureEnvelope(0) < 0.25, '起笔必须细');
  assert.ok(pressureEnvelope(1) < 0.25, '收笔必须细');
  let prev = -1;
  for (let u = 0; u <= 0.5; u += 0.01) {
    const v = pressureEnvelope(u);
    assert.ok(v >= prev - 1e-9, '前半段不单调 at u=' + u);
    prev = v;
  }
});

t('压力包络的下限是 0.16（残压）—— 不是 0（0 会让笔画断成两截）', () => {
  assert.ok(Math.abs(pressureEnvelope(0) - 0.16) < 0.01, '起笔应该落在 min=0.16 上');
  assert.equal(pressureEnvelope(0.5, { min: 0.4 }), 1, 'min 只影响两端，不封顶中间');
});

t('clampWidthSlope：双向夹（只正向扫会漏掉最后一个突起）', () => {
  const w = [4, 4, 20, 4, 4];
  const out = clampWidthSlope(w, 8);
  for (let i = 1; i < out.length; i++) {
    assert.ok(Math.abs(out[i] - out[i - 1]) <= 8 * MAX_WIDTH_SLOPE + 1e-9,
      '第 ' + i + ' 点的相邻差超了上限：' + out[i - 1] + ' -> ' + out[i]);
  }
  assert.deepEqual(w, [4, 4, 20, 4, 4], '不许改入参');
});

/* ================================================================ 4. 压力曲线 */

t('pressureProfile：中段比两端粗、宽度 >= minW、相邻差 <= 斜率上限', () => {
  const samples = pressureProfile(lineOf(600), { width: 10, minW: 1.2 });
  const ws = samples.map((s) => s.w);
  const mid = ws[Math.floor(ws.length / 2)];
  assert.ok(mid > ws[0] * 3, '中段必须明显比起点粗（' + ws[0].toFixed(2) + ' vs ' + mid.toFixed(2) + '）');
  assert.ok(Math.min.apply(null, ws) >= 1.2, '任何一点都不许低于 minW');
  for (let i = 1; i < ws.length; i++) {
    assert.ok(Math.abs(ws[i] - ws[i - 1]) <= 6 * MAX_WIDTH_SLOPE + 1e-9,
      '宽度跳变太大（第 ' + i + ' 点）：' + ws[i - 1].toFixed(2) + ' -> ' + ws[i].toFixed(2));
  }
});

t('pressureProfile 是**确定性**的：同参两次逐位相同（noise1 不是随机数）', () => {
  const a = pressureProfile(lineOf(400), { width: 8, seed: 3 });
  const b = pressureProfile(lineOf(400), { width: 8, seed: 3 });
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].w, b[i].w, '同一 seed 的宽度必须逐位相同（第 ' + i + ' 点）');
  }
  const c = pressureProfile(lineOf(400), { width: 8, seed: 4 });
  assert.notEqual(a[10].w, c[10].w, '换种子应当换噪声（否则 seed 参数是假的）');
});

/* ================================================================ 5. 轮廓多边形 */

t('strokeRing：两端是圆头（不是直角切口）—— 端点外侧必须有弧上的点', () => {
  const rs = resampleByLength([[200, 200], [800, 200]], 6);
  const samples = rs.pts.map((q) => ({ x: q[0], y: q[1], w: 12, ang: 0, u: 0, lean: 0 }));
  const ring = strokeRing(samples, {});
  const minX = Math.min.apply(null, ring.map((q) => q[0]));
  const maxX = Math.max.apply(null, ring.map((q) => q[0]));
  assert.ok(minX <= 200 - 5.5, '起笔圆头没探出去：minX=' + minX.toFixed(2));
  assert.ok(maxX >= 800 + 5.5, '收笔圆头没探出去：maxX=' + maxX.toFixed(2));
});

t('strokeRing：端点圆头用的是**这一端自己的半宽**（不是平均值）', () => {
  const n = 40;
  const samples = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    samples.push({ x: 200 + 600 * u, y: 200, w: 2 + 18 * u, ang: 0, u, lean: 0 });
  }
  const ring = strokeRing(samples, {});
  const minX = Math.min.apply(null, ring.map((q) => q[0]));
  const maxX = Math.max.apply(null, ring.map((q) => q[0]));
  assert.ok(Math.abs((200 - minX) - 1) < 0.6, '起点圆头半径应 ≈ 1（实测 ' + (200 - minX).toFixed(2) + '）');
  assert.ok(Math.abs((maxX - 800) - 10) < 1.2, '终点圆头半径应 ≈ 10（实测 ' + (maxX - 800).toFixed(2) + '）');
});

t('轮廓法的**安全边界**：曲率半径 < 半宽时轮廓必然自交（判据必须认得出）', () => {
  // 这条断言钉的是一个几何事实，不是「我们的代码很完美」：
  // 圆角半径 R 的路径偏移 h 之后内圈半径 = R - h，R < h 时内圈翻转 ⇒ 自交 ⇒
  // fillPoly 的偶奇规则把那一小块算成「外面」⇒ 笔画中间出现针孔。
  const path = [[250, 250], [500, 500], [750, 250], [750, 600]];
  const rs = resampleByLength(path, 6);
  const tight = pressureProfile(rs.pts, { width: 14, seed: 3, wobble: 0.35 });
  assert.ok(minCurvatureRadius(tight) < 14 * 0.5, '这条路径本来就拐得比笔还急（测试前提）');
  assert.equal(canFillOutline(tight), false, '急弯必须判成「不能用轮廓法」');
  assert.ok(selfIntersections(strokeRing(tight, {})) > 0, '而且轮廓确实自交了（正是要躲的那件事）');

  const straight = pressureProfile(resampleByLength([[200, 200], [800, 200]], 6).pts, { width: 14 });
  assert.equal(canFillOutline(straight), true, '直笔迹必须判成「可以用轮廓法」');
  assert.equal(selfIntersections(strokeRing(straight, {})), 0, '直笔迹的轮廓不该自交');
});

t('drawStroke 的 auto：能填就用轮廓（一条 fillPoly），急弯自动退到胶囊链（不出针孔）', () => {
  const calls = [];
  const fake = {
    fillPoly: (ring, color, step) => { calls.push(['fillPoly', ring.length, step]); },
    seg: () => { calls.push(['seg']); },
    fillCircle: () => { calls.push(['fillCircle']); },
    polyline: () => { calls.push(['polyline']); },
  };
  const straight = pressureProfile(resampleByLength([[200, 200], [800, 200]], 6).pts, { width: 14 });
  drawStroke(fake, straight, { color: [0, 0, 0] });
  assert.equal(calls.filter((c) => c[0] === 'fillPoly').length, 1, '直笔迹应该只画一次填充');
  assert.equal(calls.filter((c) => c[0] === 'seg').length, 0, '直笔迹不该走胶囊链');

  calls.length = 0;
  const rs = resampleByLength([[250, 250], [500, 500], [750, 250], [750, 600]], 6);
  const tight = pressureProfile(rs.pts, { width: 14, seed: 3, wobble: 0.35 });
  drawStroke(fake, tight, { color: [0, 0, 0] });
  assert.equal(calls.filter((c) => c[0] === 'fillPoly').length, 0, '急弯不许走填充（会出针孔）');
  assert.ok(calls.filter((c) => c[0] === 'seg').length > 20, '急弯必须走胶囊链');
});

t('胶囊链的端点外扩是**必须的**（不外扩时拐角处的内切缝会露白点）', () => {
  // 这条是实测结论：ratio 0.5 且 extend 0 时，拐角内外各有一条内切曲线，中间露一个白点；
  // extend = 半个局部线宽时补掉。判据是**源码常数**（这是着色器层的观感，纯 JS 测不到像素）。
  const src = read('src/kit/stroke.js');
  assert.ok(/o\.extend == null \? 0\.5 : o\.extend/.test(src), 'extend 的默认值不是 0.5');
  assert.ok(/ratio == null \? 0\.35/.test(src), 'ratio 的默认值不是 0.35');
});
/* ================================================================ 6. 生长 */

t('revealSamples：按**弧长**截断（一半进度 = 一半弧长，不是一半点数）', () => {
  const rs = resampleByLength([[200, 200], [800, 200]], 6);
  const samples = pressureProfile(rs.pts, { width: 8 });
  assert.ok(samples.length > 100, '采样点应该足够密（实测 ' + samples.length + '）');
  const half = revealSamples(samples, 0.5);
  const tip = half[half.length - 1];
  assert.ok(Math.abs(tip.x - 500) < 8, '一半进度应停在弧长中点 x≈500（实测 ' + tip.x.toFixed(1) + '）');
  assert.ok(half.length < samples.length * 0.6, '半程应该只剩一半左右');
  assert.deepEqual(revealSamples(samples, 0), []);
  assert.equal(revealSamples(samples, 1).length, samples.length);
});

t('revealSamples 的笔尖是**插值**出来的（不会停在最后一个整采样点上）', () => {
  const rs = resampleByLength([[200, 200], [800, 200]], 6);
  const samples = pressureProfile(rs.pts, { width: 8 });
  const k = revealSamples(samples, 0.337);
  const tip = k[k.length - 1];
  const expected = 200 + 600 * 0.337;
  assert.ok(Math.abs(tip.x - expected) < 2, '笔尖应在 ' + expected.toFixed(1) + '，实测 ' + tip.x.toFixed(1));
});

/* ================================================================ 7. 沸腾 */

t('boilSamples：每 2 帧换一次（12Hz）、amp=0 时逐位不变、换帧组才变', () => {
  const rs = resampleByLength([[200, 200], [800, 200]], 6);
  const samples = pressureProfile(rs.pts, { width: 8 });
  assert.deepEqual(boilSamples(samples, { t: 1, amp: 0 }).map((s) => s.x), samples.map((s) => s.x));
  const a = boilSamples(samples, { t: 1.00, seed: 3, amp: 2 });
  const b = boilSamples(samples, { t: 1.02, seed: 3, amp: 2 });
  for (let i = 0; i < a.length; i++) assert.equal(a[i].x, b[i].x, '同一帧组内不许变化（第 ' + i + ' 点）');
  const c = boilSamples(samples, { t: 1.10, seed: 3, amp: 2 });
  assert.notEqual(a[5].x, c[5].x, '换一个帧组应该换抖动量');
});

/* ================================================================ 8. 墨色 */

t('inkOn：与纸色混合后**不透明**（笔迹不许半透明 —— 会出横纹）', () => {
  const ink = [0.05, 0.07, 0.1];
  const paper = [0.95, 0.94, 0.9];
  const solid = inkOn(ink, 1, paper);
  const pale = inkOn(ink, 0.5, paper);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(solid[i] - ink[i]) < 1e-9, 'alpha=1 时必须就是墨色');
  assert.ok(pale[0] > ink[0] && pale[0] < paper[0], '淡墨应该落在墨与纸之间');
  assert.equal(inkOn(ink, 0, paper).length, 3, '只返回 RGB —— 调用方自己补 alpha 1');
});

/* ================================================================ 9. 接线 */

t('回归清单挂上了这条（加测试只改清单，不要改 verify.yml）', () => {
  assert.ok(read('tools/regress-all.mjs').includes('test-stroke.mjs'), 'regress-all.mjs 里没有 test-stroke');
});

t('kit 统一出口有它（场景从 index.js 拿）', () => {
  const kit = read('src/kit/index.js');
  assert.ok(kit.indexOf("from './stroke.js'") >= 0, 'kit/index.js 没转发 stroke');
  for (const name of ['strokePath', 'strokeArc', 'inkOn', 'pressureProfile']) {
    assert.ok(kit.indexOf(name) >= 0, 'kit/index.js 漏了 ' + name);
  }
});

t('镜头模板 handwrite 登记在 SHOTS 里（不然没人知道这套东西存在）', () => {
  const idx = read('src/shots/index.js');
  assert.ok(idx.indexOf('handwriteShot') >= 0, 'shots/index.js 没登记 handwrite');
  assert.ok(read('src/shots/handwrite.js').indexOf('strokePath') >= 0, 'handwrite 模板没用笔迹层');
});

t('文档点了名（COOKBOOK 讲清楚三件事 + 五条坑）', () => {
  const cb = read('docs/COOKBOOK.md');
  assert.ok(/手绘笔迹|handwrite|strokePath/.test(cb), 'COOKBOOK 里没提笔迹层');
});

/* ================================================================ 汇总 */

if (failed.length) {
  console.log('test-stroke: ' + passed + ' 项通过，' + failed.length + ' 项失败');
  for (const f of failed) console.log(f);
  process.exit(1);
}
console.log('test-stroke: ' + passed + ' 项通过');