#!/usr/bin/env node
// @ts-check
/**
 * 分块增量重渲的判据（BACKLOG 1-45）—— **纯逻辑**回归，几毫秒跑完。
 *
 *   node tools/test-block-sig.mjs
 *
 * 这两件事错了不会报错，只会**悄悄用旧画面**：
 *   ① `sceneFileIndex()` 把段 id 映射到源文件 —— 漏映射 ⇒ 改了场景还复用旧块；
 *   ② `blockSignature()` 决定"这一块能不能复用" —— 少算 ⇒ 旧块冒充新画面；多算 ⇒ 白重渲。
 * 所以每一条都钉一个断言。
 */

import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sceneFileIndex, blockSignature } from '../scripts/lib/blocksig.mjs';

let fail = 0;
let pass = 0;
/** @param {boolean} cond @param {string} msg */
function ok(cond, msg) {
  if (cond) { pass++; console.log(`✓ ${msg}`); } else { fail++; console.error(`✗ ${msg}`); }
}
/** @param {string} msg */
function section(msg) { console.log(`\n── ${msg} ──`); }

const root = mkdtempSync(path.join(tmpdir(), 'anim-blocksig-'));
const scenes = path.join(root, 'tasks', 't1', 'scenes');
mkdirSync(scenes, { recursive: true });

/** 写一个场景文件并给它一个确定的 mtime（秒） */
function scene(name, body, t) {
  const f = path.join(scenes, name);
  writeFileSync(f, body);
  utimesSync(f, t, t);
  return f;
}

scene('title.js', "export default { id: 'title', render() {} };\n", 1000);
scene('chart.js', "import { makeShot } from '../../../src/kit/index.js';\nexport default makeShot('chart', { draw() {} });\n", 1000);
scene('outro.js', "import { shot } from '../../../src/shots/index.js';\nexport default shot('outro', {});\n", 1000);

const timeline = [
  { id: 'title', start: 0, end: 4 },
  { id: 'chart', start: 4, end: 9 },
  { id: 'outro', start: 9, end: 13 },
];

/* ---------------------------------------------------------------- id 映射 */

section('段 id → 源文件（三种写法都要认）');
const index = sceneFileIndex(path.join(root, 'tasks', 't1'), root);
ok(index.byId.get('title')?.length === 1, "认 id: 'title'");
ok(index.byId.get('chart')?.length === 1, "认 makeShot('chart', …)");
ok(index.byId.get('outro')?.length === 1, "认 shot('outro', …)");
ok(index.byId.get('title')[0] === 'tasks/t1/scenes/title.js', '路径用 / 分隔且相对 root（跨平台签名一致）');
ok(index.byId.get('nope') === undefined, '没出现过的 id 不瞎猜');

/* ---------------------------------------------------------------- 块签名 */

const sigOf = (from, to, extra = {}) => blockSignature({
  root,
  engineSig: extra.engineSig ?? 'e1',
  paramsText: extra.paramsText ?? 'p1',
  timeline: extra.timeline ?? timeline,
  index,
  from,
  to,
});

section('块的覆盖范围：只看**真正跨过**这一块的段');
const b1 = sigOf(0, 4);
const b2 = sigOf(4, 9);
ok(b1.includes('tasks/t1/scenes/title.js'), '第 1 块（0–4s）包含 title.js');
ok(!b1.includes('tasks/t1/scenes/chart.js'), '第 1 块**不**包含 chart.js（没跨过来就不算）');
ok(b2.includes('tasks/t1/scenes/chart.js'), '第 2 块（4–9s）包含 chart.js');
ok(!b2.includes('tasks/t1/scenes/outro.js'), '第 2 块不包含 outro.js');

section('改一个镜头 → 只有它所在那块签名变');
const before2 = sigOf(4, 9);
const before1 = sigOf(0, 4);
const chartFile = path.join(scenes, 'chart.js');
utimesSync(chartFile, 2000, 2000);
const after2 = sigOf(4, 9);
const after1 = sigOf(0, 4);
ok(before2 !== after2, 'chart.js 改了 ⇒ 第 2 块签名变（会重渲）');
ok(before1 === after1, 'chart.js 改了 ⇒ 第 1 块签名**不变**（跳过）');

section('引擎变了 → 每一块都失效');
ok(sigOf(0, 4, { engineSig: 'e2' }) !== sigOf(0, 4), 'engineSig 变 ⇒ 第 1 块签名变');
ok(sigOf(4, 9, { engineSig: 'e2' }) !== sigOf(4, 9), 'engineSig 变 ⇒ 第 2 块签名变');

section('渲染参数变了 → 每一块都失效');
ok(sigOf(0, 4, { paramsText: 'p2' }) !== sigOf(0, 4), 'paramsText 变 ⇒ 签名变');
ok(sigOf(9, 13, { paramsText: 'p2' }) !== sigOf(9, 13), '最后一块也一样');

section('时间线上的段参数变了 → 那块失效');
const t2 = timeline.map((s) => (s.id === 'chart' ? { ...s, params: { variant: 'grid' } } : s));
ok(sigOf(4, 9, { timeline: t2 }) !== sigOf(4, 9), 'chart 的 params 变 ⇒ 第 2 块签名变');
ok(sigOf(0, 4, { timeline: t2 }) === sigOf(0, 4), '其它块不受影响');

section('查不到源文件的段：永远重渲（不猜）');
const t3 = [...timeline, { id: 'ghost', start: 12, end: 14 }];
const g = sigOf(9, 13, { timeline: t3 });
ok(g.includes('?:ghost'), '未知 id 记成 ?ghost');
ok(g === sigOf(9, 13, { timeline: t3 }), '同一状态两次算出来一样（稳定）');
ok(g !== sigOf(9, 13), '但与"没有这个段"的签名不同 ⇒ 不会误复用');

section('块的边界进 key（调用方负责）');
ok(sigOf(0, 4) !== sigOf(0, 5), '同一段、不同边界 ⇒ 签名不同（时间线挪位后不复用旧块）');

/* ---------------------------------------------------------------- 收尾 */

try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`\n${fail ? `✗ ${fail} 项失败` : `✓ ${pass} 项全部通过`}（共 ${pass + fail} 项）`);
process.exit(fail ? 1 : 0);
