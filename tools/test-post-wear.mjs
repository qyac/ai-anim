#!/usr/bin/env node
// @ts-check
/**
 * 胶片磨损（`post.weave` / `post.flicker` / `post.scratch`，BACKLOG 1-64）的**纯逻辑 + 接线**回归。
 *
 *   node tools/test-post-wear.mjs
 *
 * 这一层最贵的错是「默认不是关的」：三个参数只要有一个默认 >0，全仓库已交付片子的
 * 画面就整体变了一遍，而 hashes 基线会集体变红 —— 但更糟的情况是有人图省事
 * 直接 `--accept` 掉，于是「谁改坏了」和「本来就要变」混成一笔账。
 * 所以这里把 **默认值 = 0** 与 **动画时间只来自 t** 两条钉死。
 *
 * 为什么大部分断言是读源码（静态接线自检）：磨损的数学在 pFinal 的 GLSL 里，
 * 离线跑不起来；而「uniform 没接上 / 引擎没喂 t」这类错**画面照出、只是不对**，
 * 正是要靠源码断言在 CI 里拦下的那类。行为层面的验证在夹具 `tasks/_wear-lab`
 * （`node scripts/anim.mjs check _wear-lab` + `hashes`）。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_POST, Post, grainDesignFor } from '../src/core/post.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

let fail = 0;
let pass = 0;
/** @param {boolean} cond @param {string} msg */
function ok(cond, msg) {
  if (cond) { pass++; console.log('✓ ' + msg); } else { fail++; console.error('✗ ' + msg); }
}
/** @param {string} msg */
function section(msg) { console.log('\n── ' + msg + ' ──'); }

const postSrc = read('src/core/post.js');
const engineSrc = read('src/core/engine.js');

/* ════════════════════════════════════════════════ 默认关 */
section('默认必须全 0（不写 = 一个像素都不变）');
ok(DEFAULT_POST.weave === 0, 'DEFAULT_POST.weave === 0');
ok(DEFAULT_POST.flicker === 0, 'DEFAULT_POST.flicker === 0');
ok(DEFAULT_POST.scratch === 0, 'DEFAULT_POST.scratch === 0');
ok(!('wearT' in DEFAULT_POST), 'wearT 不是公开参数（由引擎每帧喂 t，作者写不了也冻不住）');
ok(typeof grainDesignFor === 'function' && grainDesignFor({ grainScale: 'screen' }, { pw: 3840, w: 1920 }) === 0,
  'grainDesignFor 未被顺手改掉（screen 栅格仍按物理像素算）');

/* ════════════════════════════════════════════════ 接线 */
section('接线：uniform 在、引擎喂 t、time 只来自 t');
for (const u of ['weave', 'flicker', 'scratch', 'wearT']) {
  ok(new RegExp('uniform float weave, flicker, scratch, wearT;').test(postSrc) || postSrc.includes(u),
    `pFinal 声明了 uniform ${u}`);
}
ok(postSrc.includes('uniform float weave, flicker, scratch, wearT;'),
  '三个磨损 uniform 与 wearT 在**同一行**声明（改漏一个就红）');
ok(postSrc.includes('render(gl, srcTex, dst, p, seed = 0, t = 0)'),
  'Post.render() 收第 6 参 t（磨损的动画时间源）');
ok(postSrc.includes('wearT: t,'), 'render() 把 t 喂进 wearT uniform');
ok(engineSrc.includes('frameSeed(idx), t)'),
  '引擎 post.render 调用处真的传了 t（少传这个参 = 磨损冻结在第 0 帧，且不报错）');

/* ════════════════════════════════════════════════ 零开销 */
section('零开销：0 时走不到磨损代码');
// 每个磨损效果都必须有「> 0 才执行」的守卫（否则 0 也会改采样/改亮度）
ok(/if \(weave > 0\.0\)/.test(postSrc), 'weave 有 if (weave > 0.0) 守卫（0 时不动 uv）');
ok(/if \(flicker > 0\.0\)/.test(postSrc), 'flicker 有 if (flicker > 0.0) 守卫（0 时不动亮度）');
ok(/if \(scratch > 0\.0\)/.test(postSrc), 'scratch 有 if (scratch > 0.0) 守卫');

/* ════════════════════════════════════════════════ 纯函数性 */
section('磨损的时间函数必须只吃 t（不许读帧号 / 墙钟）');
// 磨损函数（weaveDx / flickerGain / scratchDarken）体内不许出现 seed（帧号种子）：
// 用了 seed 就不是「任意 seek 都重放同一帧」了。
for (const fn of ['weaveDx', 'flickerGain', 'scratchDarken']) {
  const m = postSrc.match(new RegExp(fn + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\s*\\}')); 
  ok(!!m, `找到磨损函数 ${fn} 的定义`);
  if (m) ok(!/\bseed\b/.test(m[0]), `${fn} 体内不读 seed（时间只来自 wearT）`);
}
ok(postSrc.includes('wearT'), '磨损用 wearT（= 整片时间），由引擎每帧传入');

console.log(`\n${fail ? '✗' : '✓'} ${pass} 项通过${fail ? `，${fail} 项失败` : ''}`);
process.exit(fail ? 1 : 0);
