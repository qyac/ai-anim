#!/usr/bin/env node
/**
 * 运动上限的静态扫描（BACKLOG 1-33；判据来自 src/kit/motion.js 的两条数值上限）。
 *
 * waterfallStagger() 能在运行时把超限的错峰压回去，但它只在作者想起来调用时才生效；
 * 直接写 stagger: 0.075 的人不会收到任何提示。这一层补的就是那个提示：
 * 从源码字面量算出「这一组的级联跨度」，与 waterfallOver() 用同一个判据、同一个 0.5s。
 *
 * 扫什么：stagger: <数字>，并向前找同一个调用里的字符串字面量（元素个数 = 字数）
 * 或数组字面量（元素个数 = 项数）。两样都找不到就记 unchecked —— 不猜。
 *
 * 判据口径（与 waterfallOver 逐字一致）：items × stagger > MAX_STAGGER_SPAN(0.5)。
 * 0.5 是外部经验值（docs/MOTION.md §0），不是实测结论；所以默认只报读数，
 * 要它当门就得显式 --strict（anim check --strict 里接的就是这条）。
 *
 *   node tools/lint-motion-caps.mjs                 # 扫 tasks/ 与 src/shots/（库卫生）
 *   node tools/lint-motion-caps.mjs <任务>           # 只扫一个任务（check 用它）
 *   node tools/lint-motion-caps.mjs --strict        # 有命中就退出码 1
 *   node tools/lint-motion-caps.mjs --json          # 机器可读
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_STAGGER_SPAN = 0.5;

/** 把注释抹成空格（保留换行与列位置，报错才能给准行号）。 */
export function maskComments(src) {
  const out = src.split('');
  let i = 0;
  let state = 'code';
  while (i < src.length) {
    const c = src[i], d = src[i + 1] || '';
    if (state === 'code') {
      if (c === '/' && d === '/') { state = 'line'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      if (c === '/' && d === '*') { state = 'block'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      i++; continue;
    }
    if (state === 'line') { if (c === '\n') state = 'code'; else out[i] = ' '; i++; continue; }
    if (c === '*' && d === '/') { out[i] = ' '; out[i + 1] = ' '; state = 'code'; i += 2; continue; }
    if (c !== '\n') out[i] = ' ';
    i++;
  }
  return out.join('');
}

/** 字符数（与引擎 cjk.js 的 segment 口径近似：按码点算，CJK 一字一个）。 */
export function charCount(s) { return [...s].length; }

/** 从前缀里找最后出现的单引号字符串字面量，返回内容；找不到返回 null。 */
export function lastStringLiteral(text) {
  const re = /'((?:[^'\\\n]|\\.)*)'/g;
  let best = null, m;
  while ((m = re.exec(text))) best = { index: m.index, value: m[1] };
  return best ? best.value : null;
}

/** 数组字面量的项数：只认扁平、不含方括号的写法。 */
export function lastArrayLiteral(text) {
  const m = /\[([^\[\]]*)\]/g;
  let best = null, hit;
  while ((hit = m.exec(text))) best = hit;
  if (!best) return null;
  const body = best[1].trim();
  if (!body) return 0;
  return body.split(',').length;
}

/**
 * 收集文件级的 `const NAME = <数字|'字符串'|[数组]>`（只认单行、字面量）。
 *
 * 为什么必须有它：真实场景里最常见的写法是 `const STAGGER = 0.06` 再 `stagger: STAGGER`，
 * 只认行内字面量的 lint 会在这种（占多数）写法上**全落进 unchecked** —— 那是假检查。
 * @param {string} code 已抹掉注释的源码
 * @returns {{ nums: Map<string, number>, texts: Map<string, number> }} texts 存的是字符数
 */
export function collectConsts(code) {
  const nums = new Map();
  const texts = new Map();
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(-?[0-9]*\.?[0-9]+)\b/g)) {
    nums.set(m[1], Number(m[2]));
  }
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*'((?:[^'\\\n]|\\.)*)'\s*;?/g)) {
    texts.set(m[1], charCount(m[2]));
  }
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[([^\[\]]*)\]\s*;?/g)) {
    const body = m[2].trim();
    texts.set(m[1], body === '' ? 0 : body.split(',').length);
  }
  return { nums, texts };
}

/**
 * 扫描一批源码，返回判读结果（纯函数，测试直接喂字符串）。
 * @param {{ file: string, text: string }[]} sources
 * @param {{ cap?: number }} [opts]
 */
export function scanMotionCaps(sources, opts = {}) {
  const cap = Number.isFinite(opts.cap) ? opts.cap : MAX_STAGGER_SPAN;
  const checked = [], over = [], unchecked = [];
  let files = 0;
  for (const src of sources) {
    files++;
    const code = maskComments(String(src.text ?? ''));
    const { nums, texts } = collectConsts(code);
    // 值可以是数字字面量，也可以是 const 名字（stagger: STAGGER）
    const re = /stagger\s*:\s*([A-Za-z_$][\w$]*|[0-9]*\.?[0-9]+)\b/g;
    let m;
    while ((m = re.exec(code))) {
      const raw = m[1];
      const stagger = /^[0-9]/.test(raw) ? Number(raw) : nums.get(raw);
      if (!Number.isFinite(stagger)) continue;   // 连常量表里都没有 ⇒ 这一处没法判，交给 unchecked 之外的处理
      const line = code.slice(0, m.index).split('\n').length;
      const back = code.slice(Math.max(0, m.index - 800), m.index);
      // 元素个数 = **文字绘制调用的第一个实参**。
      // ⚠ 不能"抓窗口里最后一个字符串字面量"：那样会抓到 family: 'sans' 这类样式值
      // （第一版就是这么把 7 个字的超限段读成 4 个字、"合规"了 —— 假阴性）。
      let items = null;
      let how = '';
      const calls = [...back.matchAll(/(?:type\.)?(?:write|writeLine|karaoke|wrap)\(\s*(?:([A-Za-z_$][\w$]*)|'((?:[^'\\\n]|\\.)*)')/g)];
      const call = calls.length ? calls[calls.length - 1] : null;
      if (call) {
        if (call[1] && texts.has(call[1])) { items = texts.get(call[1]); how = 'const'; }
        else if (call[2] != null) { items = charCount(call[2]); how = 'string'; }
      }
      if (items == null) {
        // 退一步：调用实参是个数组字面量（比如 items.forEach 的 items 常量表里存的项数）
        const arr = lastArrayLiteral(back);
        if (arr != null) { items = arr; how = 'array'; }
      }
      const row = { file: src.file, line, stagger, items, how, span: items == null ? null : items * stagger };
      if (items == null) unchecked.push(row);
      else if (row.span > cap + 1e-9) over.push(row);
      else checked.push(row);
    }
  }
  // 简写属性 `{ stagger, … }`：值在别处（多半是函数参数或解构），静态读不出 ——
  // 但**必须让它进 unchecked**，否则"看不见"会被误读成"合规"。
  for (const src of sources) {
    const code = maskComments(String(src.text ?? ''));
    const { nums } = collectConsts(code);
    // \bstagger\b：staggerDur / myStagger 这种前缀/后缀都不算（第一版漏了 \b，一行报两条）
    for (const m of code.matchAll(/(?<![.\w$])stagger\b(?!\s*:)/g)) {
      const line = code.slice(0, m.index).split('\n').length;
      // 同一行只记一条（一行里可能既有 stagger 又有 staggerDur 之类）
      if (checked.concat(over, unchecked).some((r0) => r0.file === src.file && r0.line === line)) continue;
      const v = nums.get('stagger');
      unchecked.push({ file: src.file, line, stagger: Number.isFinite(v) ? v : null, items: null, how: 'shorthand', span: null });
    }
  }
  return { checked, over, unchecked, files };
}

/* ------------------------------------------------------------------ CLI */

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const strict = argv.includes('--strict');
  const taskArg = argv.find((a) => !a.startsWith('-'));
  const dirs = taskArg
    ? [path.join(ROOT, 'tasks', taskArg)]
    : [path.join(ROOT, 'tasks'), path.join(ROOT, 'src', 'shots')];
  const files = dirs.flatMap((d) => {
    try { return statSync(d).isDirectory() ? walk(d) : [d]; } catch { return []; }
  });
  if (!files.length) {
    const msg = taskArg
      ? '任务 ' + taskArg + ' 下没有 .js：' + path.relative(ROOT, dirs[0])
      : '没有扫到任何 .js';
    if (json) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
    else console.log('✗ ' + msg);
    process.exitCode = 2;
    return;
  }
  const sources = files.map((f) => ({
    file: path.relative(ROOT, f).split(path.sep).join('/'),
    text: readFileSync(f, 'utf8'),
  }));
  const r = scanMotionCaps(sources);
  if (json) {
    console.log(JSON.stringify({ ok: r.over.length === 0, cap: MAX_STAGGER_SPAN, ...r }, null, 2));
  } else {
    console.log('运动上限静态扫描（stagger 跨度 ≤ ' + MAX_STAGGER_SPAN + 's，判据同 waterfallOver）：');
    console.log('  扫了 ' + r.files + ' 个 .js：可判 ' + r.checked.length + ' 处 · 超限 '
      + r.over.length + ' 处 · 读不出元素个数 ' + r.unchecked.length + ' 处');
    for (const o of r.over) {
      console.log('  ✗ ' + o.file + ':' + o.line + '  stagger ' + o.stagger + ' × ' + o.items
        + ' 项（' + o.how + '）= ' + o.span.toFixed(3) + 's > ' + MAX_STAGGER_SPAN + 's');
      console.log('      → 用 waterfallStagger(items, stagger).stagger 喂 type.write（按 0.5s/items 压回）');
    }
    if (!r.over.length && !r.checked.length) {
      console.log('  （没有可判的对象 —— 这一项没验；空不等于干净）');
    } else if (!r.over.length) {
      console.log('  ✓ 可判的每一处都在上限内');
    }
    if (r.unchecked.length) {
      console.log('  ⚠ ' + r.unchecked.length + ' 处读不出元素个数（不是通过）：');
      for (const u of r.unchecked.slice(0, 8)) console.log('      ' + u.file + ':' + u.line + '  stagger ' + u.stagger);
    }
  }
  process.exitCode = (strict && r.over.length) ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith('lint-motion-caps.mjs')) main();
