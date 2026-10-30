#!/usr/bin/env node
/**
 * 日语配音 + 中文字幕：用 `narration.mjs` 里每行的 `zh` 字段生成字幕表。
 *
 *   node scripts/make-ja-zhsub.mjs
 *
 * 为什么不再从旧的中文任务读：那个任务已经删了，`zh` 直接写在旁白脚本里 ——
 * 一句日语、一句中文放在同一行，改文案时不会两边漂。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const taskDir = path.join(ROOT, 'tasks', 'nekohome-intro-ja');
const timingPath = path.join(taskDir, 'audio', 'ja.timing.json');
if (!existsSync(timingPath)) {
  console.error('没有 audio/ja.timing.json —— 先跑 anim say --table ja');
  process.exit(2);
}

// ⚠ Windows：import() 收绝对路径会报 ERR_UNSUPPORTED_ESM_URL_SCHEME（'c:'），必须转 file:// URL
const narr = await import(pathToFileURL(path.join(taskDir, 'narration.mjs')).href);
const timing = JSON.parse(readFileSync(timingPath, 'utf8'));
const zhOf = new Map();
for (const sc of narr.SCENES) {
  sc.lines.forEach((l, i) => zhOf.set(`${sc.id}-${i + 1}`, l.zh ?? l.text));
}

const lines = timing.scenes.flatMap((sc) => sc.lines.map((l, i) => ({
  id: `${sc.id}-${i + 1}`,
  text: zhOf.get(`${sc.id}-${i + 1}`) ?? l.text,
  start: l.start,
  dur: l.dur,
})));

const missing = lines.filter((l) => !zhOf.has(l.id));
const out = { source: './audio/ja-vo.mp3', lines };
writeFileSync(path.join(taskDir, 'audio', 'ja-sub-zh.narration.json'), JSON.stringify(out, null, 2) + '\n');
console.log('✓ audio/ja-sub-zh.narration.json  ' + lines.length + ' 行（时间轴=日语，文本=中文）');
if (missing.length) console.log('  ⚠ 缺少中文：' + missing.map((l) => l.id).join(', '));
