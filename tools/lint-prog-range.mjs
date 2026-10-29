#!/usr/bin/env node
/**
 * `prog(t, a, b)` 的 **b 是结束时刻**，不是时长 —— 写成时长（b ≤ a）时它恒为 0，
 * 元素**永远不出现**，而且不报错、check 也不管（它只量亮度/版面）。
 *
 *   node tools/lint-prog-range.mjs [目录…]      # 默认扫 tasks/ 与 src/
 *
 * 实测代价：`membersWall` 四张成员卡里第 3、4 张从第一版起就没画出来过 ——
 * 观众看到的是「四个名字、只有两个卡片」，被说成「严重错位」。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const dirs = roots.length ? roots.map((d) => path.resolve(d)) : [path.join(ROOT, 'tasks'), path.join(ROOT, 'src')];

const files = [];
function walk(d) {
  let st;
  try { st = statSync(d); } catch { return; }
  if (st.isDirectory()) {
    for (const e of readdirSync(d)) walk(path.join(d, e));
  } else if (/\.(js|mjs)$/.test(d)) files.push(d);
}
for (const d of dirs) walk(d);

/** 取出 prog( 后面那层括号里的参数（按顶层逗号切） */
function argsOf(src, openIdx) {
  let depth = 0, cur = '', out = [];
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) { out.push(cur); return out; }
    } else if (c === ',' && depth === 1) { out.push(cur); cur = ''; continue; }
    if (depth >= 1) cur += c;
  }
  return out;
}

let hits = 0, scanned = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  for (const m of src.matchAll(/\bprog\s*\(/g)) {
    scanned++;
    const args = argsOf(src, m.index + m[0].length - 1);
    const a = args[1]?.trim(), b = args[2]?.trim();
    if (!a || !b) continue;
    const num = (x) => (/^[-\d.]+$/.test(x) ? Number(x) : null);
    const na = num(a), nb = num(b);
    const line = src.slice(0, m.index).split('\n').length;
    if (na !== null && nb !== null && nb <= na) {
      hits++;
      console.log(`${rel}:${line}  prog(${a}, ${b}) —— b ≤ a，永远返回 0（b 是结束时刻不是时长）`);
    }
  }
}
console.log('');
console.log(hits
  ? `✗ ${hits} 处 b ≤ a（这些元素永远不出现）`
  : `✓ 没有 b ≤ a 的 prog（扫了 ${scanned} 处调用 / ${files.length} 个文件）`);
process.exitCode = hits ? 1 : 0;
