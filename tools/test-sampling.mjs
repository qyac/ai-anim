#!/usr/bin/env node
// @ts-check
/**
 * 自适应子帧采样的**离线回归**（纯 JS，不需要 GPU、不需要浏览器）。
 *
 *   node tools/test-sampling.mjs
 *
 * 为什么值得单开一个文件：这一层以前整个活在 `Engine.render()` 的循环里，正确性**只能靠
 * 出片速度反推**。于是三个 bug 同时存在了很久：误差读数恒为 0（8bit/浮点格式不匹配）、
 * 新一组的均值权重差 2 倍、子帧位置外推出快门窗口。三条都不报错，只是让整条引擎的
 * 运动模糊**从来没有按设计工作过**（`docs/HANDOFF-spectrum-friction.md` §1）。
 *
 * 退出码：0 = 全通过 · 1 = 有断言失败。
 */

import {
  BASE_SAMPLES, MAX_SAMPLES, DEFAULT_TOL, ERROR_QUANTILE,
  fixedOffsets, ternaryOffsets, snapMaxSamples, levelsFor,
  quantileFromHist, samplingVerdict, describeSampling, SAMPLE_REASONS,
} from '../src/core/sampling.js';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`);
  if (ok) pass++; else fail++;
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

console.log('① 档位：maxSamples 只能是 8·3^L（只往下压，写 7 抬到 8）');
check('不传 = 顶档 216', snapMaxSamples(undefined) === MAX_SAMPLES);
check('0 / 负数 / NaN 也当不封顶', snapMaxSamples(0) === MAX_SAMPLES && snapMaxSamples(-3) === MAX_SAMPLES && snapMaxSamples(NaN) === MAX_SAMPLES);
check('8 → 8', snapMaxSamples(8) === 8);
check('24 → 24', snapMaxSamples(24) === 24);
check('36 → 24（夹到合法档，不是 36）', snapMaxSamples(36) === 24);
check('64 → 24', snapMaxSamples(64) === 24);
check('72 → 72', snapMaxSamples(72) === 72);
check('100 → 72', snapMaxSamples(100) === 72);
check('1000 → 216', snapMaxSamples(1000) === MAX_SAMPLES);
check('7 → 8（比 8 更少等于关掉运动模糊，那该写 samples: 1）', snapMaxSamples(7) === 8);
check('levelsFor：8→0 / 24→1 / 72→2 / 216→3',
  levelsFor(8) === 0 && levelsFor(24) === 1 && levelsFor(72) === 2 && levelsFor(216) === 3,
  `实际 ${[8, 24, 72, 216].map(levelsFor).join(' / ')}`);

console.log('\n② 子帧位置：等距、居中、**全部落在快门窗口内**');
for (const L of [0, 1, 2, 3]) {
  const u = ternaryOffsets(L);
  const n = BASE_SAMPLES * 3 ** L;
  check(`${n} 子帧：数量与首尾`, u.length === n && u[0] > -0.5 && u[u.length - 1] < 0.5,
    `首 ${u[0].toFixed(4)} 尾 ${u[u.length - 1].toFixed(4)}`);
  const gaps = u.slice(1).map((v, i) => v - u[i]);
  check(`${n} 子帧：等距`, gaps.every((g) => near(g, gaps[0], 1e-9)), `间距 ${gaps[0].toFixed(6)}`);
  check(`${n} 子帧：以帧时刻为中心（左右对称）`, near(u[0], -u[u.length - 1], 1e-12));
}
// 嵌套：上一级的每个位置必须**仍在**下一级里（并总和的均值守恒靠它）
for (const L of [0, 1, 2]) {
  const a = ternaryOffsets(L), b = ternaryOffsets(L + 1);
  const hit = a.every((v) => b.some((w) => near(v, w, 1e-12)));
  check(`${a.length} 子帧全部包含在 ${b.length} 子帧里（嵌套）`, hit);
}
// 旧实现的外推缺陷：24 子帧右端曾到 +0.5486（窗外）
check('24 子帧的最后一个样本不再越出快门窗口（旧实现是 +0.5486）', ternaryOffsets(1).at(-1) < 0.5,
  `现在 ${ternaryOffsets(1).at(-1).toFixed(4)}`);
check('fixedOffsets 与 L=0 的 ternaryOffsets 是同一组数',
  fixedOffsets(BASE_SAMPLES).every((v, i) => near(v, ternaryOffsets(0)[i], 1e-12)));

console.log('\n③ 分位：单个坏格子不能决定整帧');
{
  const hist = new Uint32Array(256);
  hist.fill(0);
  // 8160 个格子里 8150 个是 0 级、10 个是 200 级（0.12%）
  hist[0] = 8150; hist[200] = 10;
  const q99 = quantileFromHist(hist, 0.99);
  check('0.12% 的坏格子 ⇒ 99 分位仍是 0', q99 === 0, `实际 ${q99}`);
  const q50 = quantileFromHist(hist, 0.5);
  check('同一个直方图的 50 分位也是 0', q50 === 0, `实际 ${q50}`);
  hist[3] = 200;   // 现在 2.4% 的格子是 3 级
  check('2.4% 的格子到 3 级 ⇒ 99 分位升到 3', quantileFromHist(hist, 0.99) === 3,
    `实际 ${quantileFromHist(hist, 0.99)}`);
  check('空直方图 ⇒ 0（= 收敛，不是 NaN）', quantileFromHist(new Uint32Array(256)) === 0);
  const all = new Uint32Array(256); all[255] = 100;
  check('全 255 ⇒ 255', quantileFromHist(all) === 255);
  check('分位常量确实是 0.99（改它要同时改文档）', ERROR_QUANTILE === 0.99);
}

console.log('\n④ 判决：收敛 / 停滞 / 到上限 / 还要加');
// tol 的单位是**显示空间级数**（0..255），err 是 0..1 —— 这条换算本身就是被钉住的判据
const tol = DEFAULT_TOL;
{
  const r = samplingVerdict([{ err: (tol / 2) / 255 }], { tol, samples: 24, maxSamples: 216 });
  check('误差小于 tol ⇒ 停（tol）', r.stop && r.reason === 'tol', JSON.stringify(r));
  const r2 = samplingVerdict([{ err: tol / 255 }], { tol, samples: 24, maxSamples: 216 });
  check('误差**等于** tol ⇒ 不停（严格小于才算收敛）', !r2.stop && r2.reason === 'more', JSON.stringify(r2));
  const r3 = samplingVerdict([{ err: 0.05 }], { tol, samples: 216, maxSamples: 216 });
  check('到上限 ⇒ 停（cap）', r3.stop && r3.reason === 'cap', JSON.stringify(r3));
  // 停滞：连续两级都降不到 70% 以下
  const stall = samplingVerdict([{ err: 0.10 }, { err: 0.095 }, { err: 0.093 }], { tol, samples: 72, maxSamples: 216 });
  check('降不下去 ⇒ 停（stall）', stall.stop && stall.reason === 'stall', JSON.stringify(stall));
  const healthy = samplingVerdict([{ err: 0.10 }, { err: 0.05 }, { err: 0.02 }], { tol, samples: 72, maxSamples: 216 });
  check('正常下降 ⇒ 继续加', !healthy.stop && healthy.reason === 'more', JSON.stringify(healthy));
  // 只降了一级还不够：至少要 stallLevels(2) 级都停滞
  const one = samplingVerdict([{ err: 0.10 }, { err: 0.10 }], { tol, samples: 24, maxSamples: 216 });
  check('只有一级停滞 ⇒ 继续加（别急着熔断）', !one.stop, JSON.stringify(one));
  const nan = samplingVerdict([{ err: NaN }], { tol, samples: 24, maxSamples: 216 });
  check('误差是 NaN ⇒ **绝不**当作收敛', !nan.stop && nan.reason === 'more', JSON.stringify(nan));
  const inf = samplingVerdict([{ err: Infinity }], { tol, samples: 24, maxSamples: 216 });
  check('误差是 Inf ⇒ 继续加 / 到上限才停', !inf.stop, JSON.stringify(inf));
  const empty = samplingVerdict([], { tol });
  check('空历史 ⇒ 继续加（没有依据时不许下结论）', !empty.stop && Number.isNaN(empty.err));
}

console.log('\n⑤ 人读的一行');
check('收敛', describeSampling({ samples: 24, reason: 'tol', err: 0.004 }).includes('收敛'));
check('停滞熔断', describeSampling({ samples: 72, reason: 'stall', err: 0.02 }).includes('停滞'));
check('没有误差时不许装作有', describeSampling({ samples: 8, reason: 'cap', err: NaN }).includes('err 不可用'));
check('静止（第一级就停）', describeSampling({ samples: 8, reason: 'static', err: 0 }).includes('静止'));
check('理由词表包含 static（机器读者依赖它）', SAMPLE_REASONS.includes('static'));

console.log('\n⑥ 常量与文档里写的一致（改它们要同时改 ENGINE.md §11 与 AGENTS.md §7）');
check('BASE_SAMPLES = 8', BASE_SAMPLES === 8);
check('MAX_SAMPLES = 216', MAX_SAMPLES === 216);
check('DEFAULT_TOL = 2.5（显示空间 0..255）', DEFAULT_TOL === 2.5);

console.log(`\n${fail ? '✗' : '✓'} ${pass} 项通过${fail ? `，${fail} 项失败` : ''}`);
process.exit(fail ? 1 : 0);
