#!/usr/bin/env node
// @ts-check
/**
 * 母题库的**纯逻辑**回归（BACKLOG 1-49）。
 *
 *   node tools/test-motifs.mjs
 *
 * 这些函数全是数学 —— 错了不会报错，只会让画面"看着有点不对"。
 * 所以每条都钉数值性质：级数在收敛、本轮与级数同源、DCT 能往返、
 * 归一化不改变形状、采样不出 NaN。
 */

import {
  squareCoeffs, squareWave, growK, epicycles,
  dct2, idct2, normalizeBlock, DCT_BLOCK,
  wavePoints, playheadX,
} from '../src/kit/index.js';

let fail = 0;
let pass = 0;
/** @param {boolean} cond @param {string} msg */
function ok(cond, msg) {
  if (cond) { pass++; console.log(`✓ ${msg}`); } else { fail++; console.error(`✗ ${msg}`); }
}
/** @param {string} msg */
function section(msg) { console.log(`\n── ${msg} ──`); }

/* ════════════════════════════════════════════════ 傅里叶 */

section('方波的系数：只取奇次项，振幅 4/πn');
{
  const C = squareCoeffs(8);
  ok(C.length === 8, `8 项（实际 ${C.length}）`);
  ok(C.every((c) => c.n % 2 === 1), '谐波次数全是奇数');
  ok(Math.abs(C[0].r - 4 / Math.PI) < 1e-12, '第 1 项振幅 = 4/π');
  ok(C[1].r < C[0].r && C[7].r < C[1].r, '振幅随 n 递减');
}

section('波形：奇函数、过零、随项数收敛到方波');
{
  const C = squareCoeffs(24);
  ok(Math.abs(squareWave(0, 24, C)) < 1e-12, 't=0 ⇒ 0（奇函数过零）');
  ok(Math.abs(squareWave(-1.3, 24, C) + squareWave(1.3, 24, C)) < 1e-12, 'f(-t) = -f(t)（奇函数）');

  // 与理想方波 sign(sin) 的 RMS 误差应随项数单调下降
  const rms = (k) => {
    let s = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      const target = Math.sin(t) >= 0 ? 1 : -1;
      s += (squareWave(t, k, C) - target) ** 2;
    }
    return Math.sqrt(s / N);
  };
  const e2 = rms(2), e8 = rms(8), e24 = rms(24);
  ok(e24 < e8 && e8 < e2, `RMS 误差递减：${e2.toFixed(3)} > ${e8.toFixed(3)} > ${e24.toFixed(3)}`);
  ok(e24 < 0.15, `24 项时 RMS ${e24.toFixed(3)} < 0.15（已经很方）`);

  // Gibbs 过冲：项数越多越贴近 1.18 左右（不会消失，只会变窄）
  let peak = 0;
  for (let i = 0; i < 2000; i++) peak = Math.max(peak, squareWave((i / 2000) * Math.PI * 2, 40, C));
  ok(peak > 1.15 && peak < 1.22, `过冲峰值 ${peak.toFixed(3)} 落在 1.15–1.22（Gibbs）`);
}

section('项数生长：growK 单调、到点停、越界夹住');
{
  ok(growK(0, 2, 8) === 1, 't=0 ⇒ 1 项');
  ok(growK(2, 2, 8) === 8, 't=ramp ⇒ 全部 8 项');
  ok(growK(99, 2, 8) === 8, '超过 ramp ⇒ 仍夹在 8');
  const seq = [0, 0.5, 1, 1.5, 2].map((t) => growK(t, 2, 8));
  ok(seq.every((v, i) => i === 0 || v >= seq[i - 1]), '单调不减');
}

section('本轮（一串圆）：末端 = 同一时刻的级数值');
{
  const C = squareCoeffs(6);
  for (const t of [0, 0.7, 2.1, 4.4]) {
    const e = epicycles(C, 6, t);
    ok(Math.abs(e.y - squareWave(t, 6, C)) < 1e-12, `t=${t}：本轮末端 y == squareWave()`);
  }
  const e0 = epicycles(C, 3, 0.9);
  ok(e0.circles.length === 3, '圆的数量 = 取的项数');
  ok(e0.circles[0].x === 0 && e0.circles[0].y === 0, '第 1 个圆从原点起（圆心在上一项末端）');
  ok(e0.circles[1].x === 0 || Number.isFinite(e0.circles[1].x), '第 2 个圆的圆心是有限值');
}

/* ════════════════════════════════════════════════ DCT */

section('8×8 DCT / IDCT：能往返、低频集中在左上');
{
  const N = DCT_BLOCK;
  const block = [];
  for (let x = 0; x < N; x++) {
    block.push([]);
    for (let y = 0; y < N; y++) block[x].push(x + y > 7 ? 0.85 : 0.12);
  }
  const coef = dct2(block);
  ok(coef.length === N * N, `64 个系数（实际 ${coef.length}）`);
  const back = idct2(coef);
  let maxErr = 0;
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) maxErr = Math.max(maxErr, Math.abs(back[x][y] - block[x][y]));
  ok(maxErr < 1e-9, `全系数往返误差 ${maxErr.toExponential(1)} < 1e-9`);

  const low = coef.filter((c) => c.u <= 1 && c.v <= 1);
  const lowEnergy = low.reduce((s, c) => s + c.c * c.c, 0);
  const all = coef.reduce((s, c) => s + c.c * c.c, 0);
  ok(lowEnergy / all > 0.5, `左上 4 个系数占了 ${((lowEnergy / all) * 100).toFixed(0)}% 能量（阶梯图该这样）`);

  const part = idct2(low);
  let diff = 0;
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) diff += Math.abs(part[x][y] - block[x][y]);
  ok(diff > 0, '只留 4 个系数 ⇒ 重建与原件有差别（有损是真的）');
}

section('归一化：min→0 / max→1、常量块不出 NaN、形状不变');
{
  const b = [[0.2, 0.6], [0.9, 0.4]];
  const n = normalizeBlock(b);
  const flat = n.flat();
  ok(Math.min(...flat) === 0 && Math.max(...flat) === 1, '拉伸到 0..1');
  ok(n[0][0] < n[0][1] && n[0][1] < n[1][0], '大小顺序保持不变');
  const c = normalizeBlock([[0.5, 0.5], [0.5, 0.5]]);
  ok(c.flat().every((v) => v === 0.5), '常量块 ⇒ 全 0.5（不除以 0）');
}

/* ════════════════════════════════════════════════ 波形 / 游标 */

section('波形采样：x 单调、y 落在框内、NaN 被吃掉、结果确定');
{
  const pts = wavePoints({ x0: 100, x1: 900, yMid: 500, amp: 100, fn: (t) => Math.sin(t), samples: 200 });
  ok(pts.length === 201, 'samples=200 ⇒ 201 个点');
  ok(pts.every((p, i) => i === 0 || p.x > pts[i - 1].x), 'x 严格递增');
  ok(pts[0].x === 100 && pts[pts.length - 1].x === 900, '首尾落在 x0 / x1');
  ok(pts.every((p) => p.y >= 500 - 100 - 1e-9 && p.y <= 500 + 100 + 1e-9), 'y 不超出 ±amp');

  const withNaN = wavePoints({ x0: 0, x1: 10, yMid: 0, amp: 10, fn: (t) => (t > 3 ? NaN : 1), samples: 20 });
  ok(withNaN.every((p) => Number.isFinite(p.y)), 'fn 吐出 NaN ⇒ 兜成 0，不把 NaN 画进顶点');

  const a = wavePoints({ x0: 0, x1: 100, yMid: 0, amp: 10, fn: (t) => Math.sin(t), samples: 50 });
  const b = wavePoints({ x0: 0, x1: 100, yMid: 0, amp: 10, fn: (t) => Math.sin(t), samples: 50 });
  ok(JSON.stringify(a) === JSON.stringify(b), '同样的输入 ⇒ 逐点相同（确定性）');
}

section('游标位置：夹在 0..1，越界不跑到框外');
{
  ok(playheadX(100, 900, 0) === 100, 'phase=0 ⇒ x0');
  ok(playheadX(100, 900, 1) === 900, 'phase=1 ⇒ x1');
  ok(playheadX(100, 900, 0.5) === 500, 'phase=0.5 ⇒ 中点');
  ok(playheadX(100, 900, -3) === 100 && playheadX(100, 900, 7) === 900, '越界自动夹住');
  ok(playheadX(100, 900, NaN) === 100, 'NaN ⇒ 回到 x0（不是 NaN 坐标）');
}

console.log(`\n${fail ? `✗ ${fail} 项失败` : `✓ ${pass} 项全部通过`}（共 ${pass + fail} 项）`);
process.exit(fail ? 1 : 0);
