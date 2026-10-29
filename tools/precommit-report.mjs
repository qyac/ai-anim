#!/usr/bin/env node
/**
 * `tools/precommit-report.mjs` —— 提交前自检（**不渲染**，秒级）。
 *
 *   node tools/precommit-report.mjs            # 只看暂存区改到的任务
 *   node tools/precommit-report.mjs --all      # 所有有 mp4 的任务
 *   node tools/precommit-report.mjs --soft     # 只警告不拦
 *
 * 判据来自 `anim report`（成片 / 卡点 / 事件密度 / 风格 / 一致性）。
 * 它读**已有的 mp4**，所以能在提交前回答一个关键问题：
 * 你改的这段代码，有没有把已经出过的片子弄坏。
 *
 * 三个刻意的取舍：
 *   · **不渲染** —— 预提交里跑渲染会把提交拖成几分钟，人就会想办法绕过钩子；
 *   · **只看改到的任务** —— 全仓扫一遍会在无关提交上反复报同一件事；
 *   · **成片比源码旧就跳过** —— 源码改了但没重渲时，密度/一致性读的是旧片，报出来是噪音。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
const SOFT = argv.includes('--soft');

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

/** 暂存区里改到的任务 + 是否动了引擎侧 */
function touched() {
  const out = git(['diff', '--cached', '--name-only']);
  const set = new Set();
  let engine = false;
  for (const line of out.split(/\r?\n/)) {
    const m = /^tasks\/([^/]+)\//.exec(line);
    if (m) set.add(m[1]);
    if (/^(src|scripts|tools)\//.test(line)) engine = true;
  }
  return { tasks: [...set], engine };
}

/** 任务目录里最新的源码修改时间（用来判断成片是否过期） */
function newestMtime(dir) {
  let latest = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'audio' || e.name === 'assets' || e.name === 'fonts') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const s = statSync(p);
        if (s.mtimeMs > latest) latest = s.mtimeMs;
      }
    }
  };
  try { walk(dir); } catch (e) { void e; }
  return latest;
}

function hasMp4(name) {
  const f = path.join(ROOT, 'out', name, name + '.mp4');
  return existsSync(f) ? f : null;
}

const touchedInfo = touched();
/** 这支片子自己的文件被改过（判据红要**拦**） */
const explicit = new Set(touchedInfo.tasks);
let names = touchedInfo.tasks;
if (ALL || touchedInfo.engine) {
  const all = readdirSync(path.join(ROOT, 'tasks'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && hasMp4(e.name))
    .map((e) => e.name)
    // _ 开头的是夹具/实验任务，不进提交门
    .filter((n) => !n.startsWith('_'));
  names = ALL ? all : [...new Set([...names, ...all])];
}
names = names.filter(hasMp4);

if (!names.length) {
  console.log('· 预提交自检：暂存区里没有已出片的任务，跳过');
  process.exit(0);
}

let failed = 0;
let stale = 0;
let advise = 0;
for (const name of names) {
  const mp4 = hasMp4(name);
  const srcT = newestMtime(path.join(ROOT, 'tasks', name));
  const mp4T = statSync(mp4).mtimeMs;
  if (mp4T < srcT - 1000) {
    stale++;
    console.log('· ' + name.padEnd(20) + ' 成片比源码旧（没重渲）→ 跳过密度/一致性');
    continue;
  }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'anim.mjs'), 'report', name, '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch (e) {
    void e;
    console.log('⚠ ' + name + '：报告没给出 JSON → ' + String(r.stderr || '').split('\n')[0]);
    continue;
  }
  const bad = (j.rows || []).filter((x) => x.ok === false);
  // 只有当这支**自己的文件**被改过，判据红才算"你改坏了"；只是被引擎改动顺带扫到的话只提醒，
  // 因为重渲与否是人的决定（预提交里不放渲染，就不该要求别人先渲一遍）。
  const isMine = ALL || explicit.has(name);
  const mark = bad.length ? (isMine ? '✗' : '⚠') : '✓';
  console.log(mark + ' ' + name.padEnd(20) + (bad.length ? bad.map((b) => b.id + '：' + b.summary).join('；') : '5 项判据通过'));
  if (bad.length && isMine) failed++;
  else if (bad.length) advise++;
}

console.log('');
if (failed) {
  console.log('✗ ' + failed + ' 支片子的判据没过（' + (SOFT ? '只警告' : '拦住本次提交') + '）');
  console.log('  查看细节：node scripts/anim.mjs report <任务>');
  if (!SOFT) process.exit(1);
} else {
  console.log('✓ 预提交自检通过' + (stale ? '（' + stale + ' 支因成片过期被跳过）' : '') + (advise ? '（' + advise + ' 支只是被引擎改动顺带扫到，判据红只提醒、不拦）' : ''));
}
