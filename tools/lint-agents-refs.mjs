#!/usr/bin/env node
// AGENTS.md 引用完整性守门。
//
// 为什么存在：AGENTS.md 的章节号（`§4` / `§10.10` / `§5.5`）被 docs/、src/、tools/、
// scripts/ 和已交付片子的场景代码当成锚点引用（实测 140+ 处 / 30+ 文件）。
// 一旦某节被改名、被搬走、或 §10 的条目被重排，引用就静默指向不存在的东西 ——
// 读者只会看到一句"详见 AGENTS.md §10.10"，然后翻不到。
//
// 判据：每个 `AGENTS.md §N` 都必须在 AGENTS.md 里有一个锚点：
//   · 标题 `## N.` / `## N.M` / `### N.M`
//   · 或 §N 章节下的有序列表项第 M 条（`§10.10` = §10 的第 10 条）
//
// 退出码：有断链 = 1；否则 0。纯 JS，不需要 GPU / 浏览器。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS = path.join(ROOT, 'AGENTS.md');

// ── 1. 建锚点 ────────────────────────────────────────────────────────────────
export function collectAnchors(md) {
  const heads = new Set();      // "4", "3.2", "5.5"
  const listItems = {};         // chapter -> Set of item numbers
  let chap = null;
  for (const ln of md.split('\n')) {
    let m;
    if ((m = ln.match(/^##\s+(\d+(?:\.\d+)?)\.?\s/))) { heads.add(m[1]); chap = m[1]; }
    else if ((m = ln.match(/^###\s+(\d+(?:\.\d+)?)\.?\s/))) { heads.add(m[1]); chap = m[1]; }
    else if ((m = ln.match(/^(\d+)\.\s+/)) && chap) {
      (listItems[chap] ||= new Set()).add(m[1]);
    }
  }
  return { heads, listItems };
}

// ── 2. 收集引用 ──────────────────────────────────────────────────────────────
export function collectRefs(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'out', '.npm-cache', 'LICENSES'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(mjs|js|cjs|md|json)$/.test(e.name)) continue;
      if (path.relative(root, p) === 'AGENTS.md') continue;
      const text = fs.readFileSync(p, 'utf8');
      const re = /AGENTS\.md[^\n]{0,30}?§\s*([0-9]+(?:\.[0-9]+)*)/g;
      let m;
      while ((m = re.exec(text))) {
        const line = text.slice(0, m.index).split('\n').length;
        out.push({ file: path.relative(root, p).replace(/\\/g, '/'), line, ref: m[1] });
      }
    }
  };
  for (const d of ['docs', 'src', 'tools', 'scripts', 'tasks']) {
    if (fs.existsSync(path.join(root, d))) walk(path.join(root, d));
  }
  return out;
}

export function check(root = ROOT) {
  const { heads, listItems } = collectAnchors(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'));
  const refs = collectRefs(root);
  const broken = [], brokenArchived = [], ok = [];
  for (const r of refs) {
    let good = heads.has(r.ref);
    if (!good && r.ref.includes('.')) {
      const [c, n] = r.ref.split('.');
      good = !!(listItems[c] && listItems[c].has(n));
    }
    if (good) { ok.push(r); continue; }
    (r.file.startsWith('docs/history/') ? brokenArchived : broken).push(r);
  }
  return { refs, broken, brokenArchived, ok };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('lint-agents-refs.mjs')) {
  const { refs, broken, ok } = check(ROOT);
  console.log(`AGENTS.md 引用：${refs.length} 处（${new Set(refs.map(r => r.file)).size} 个文件），可解析 ${ok.length}，断链 ${broken.length}`);
  if (broken.length) {
    console.log('\n断链（引用指向 AGENTS.md 里不存在的章节/条目）：');
    for (const b of broken) console.log(`  ${b.file}:${b.line}  →  §${b.ref}`);
    console.log('\n修法：要么把 AGENTS.md 的锚点补回来，要么把引用改到新位置。');
    process.exit(1);
  }
  console.log('✓ 全部可解析');
}
