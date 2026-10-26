// @ts-check
/**
 * 分块增量重渲的**判据**（BACKLOG 1-45）—— 纯函数，不碰 GPU、不碰 CLI 状态。
 *
 * 为什么单独一个模块：这两件事最容易"静默错"，而它们错了的表现是**画面错**而不是报错：
 *   ① `sceneFileIndex()` 把段 id 映射到源文件 —— 映射漏了 ⇒ 改了场景却复用旧块（拿旧画面冒充新画面）；
 *   ② `blockSignature()` 决定"这一块能不能复用" —— 多算 ⇒ 白重渲；少算 ⇒ 静默用旧块。
 * 所以它们必须是可以在 Node 里直接测的纯函数（`tools/test-block-sig.mjs`）。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** 不算"源文件"的目录（产物与运行时素材不影响画面签名） */
const SKIP_DIRS = new Set(['node_modules', 'out', '.git', 'audio', 'fonts']);
/** 场景签名关心的扩展名（字体换了画面就变，所以字体也算） */
const SOURCE_EXT = /\.(js|mjs|json|css|woff2?|ttf|otf)$/i;
/** id 只可能出现在这几种文件里 */
const JS_EXT = /\.(js|mjs)$/i;

/**
 * 递归收集文件（跳过产物/素材目录）。
 * @param {string} dir
 * @param {RegExp} accept
 * @param {string[]} [out]
 * @returns {string[]}
 */
export function walk(dir, accept, out = []) {
  let ents = [];
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, accept, out);
    } else if (accept.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 段 id → 场景源文件（静态扫任务目录下的 `.js`）。
 *
 * 为什么靠扫而不是靠运行时：场景是**浏览器侧用 Vite 的 `import.meta.glob` 加载的**，
 * CLI 手上只有时间线（段 id / 起止 / 参数），拿不到模块路径。但每个场景文件里必然写着它的 id：
 * `id: 'chart'`、`makeShot('chart', …)`、`shot('chart', …)` 三种写法。
 *
 * ⚠ 扫不到的段**不猜**：`blockSignature()` 会记一个永远不匹配的 `?<id>`，
 * 于是包含它的块每次都重渲 —— 宁可多渲一块，也不要拿旧块冒充新画面。
 *
 * @param {string} taskDir 任务目录（绝对路径）
 * @param {string} root 仓库根（用来生成相对路径；不传就用 taskDir）
 * @returns {{ byId: Map<string, string[]>, all: string[] }}
 */
export function sceneFileIndex(taskDir, root = taskDir) {
  const files = walk(taskDir, JS_EXT);
  /** @type {Map<string, string[]>} */
  const byId = new Map();
  for (const f of files) {
    let src = '';
    try { src = readFileSync(f, 'utf8'); } catch { continue; }
    const rel = path.relative(root, f).split(path.sep).join('/');
    const ids = new Set();
    for (const m of src.matchAll(/\bid:\s*['"`]([\w.-]+)['"`]/g)) ids.add(m[1]);
    for (const m of src.matchAll(/\b(?:makeShot|shot)\(\s*['"`]([\w.-]+)['"`]/g)) ids.add(m[1]);
    for (const id of ids) {
      const list = byId.get(id) ?? [];
      list.push(rel);
      byId.set(id, list);
    }
  }
  return { byId, all: files.map((f) => path.relative(root, f).split(path.sep).join('/')) };
}

/**
 * 一个**块**的签名：渲染参数 + 引擎 + 这一块覆盖到的段的场景文件与段参数。
 *
 * 保守规则（都写进 `docs/BACKLOG.md` 1-45 的判据）：
 *   · 引擎签名进每一块 ⇒ `src/` 一改，整批失效（引擎影响所有画面）；
 *   · 段查不到源文件 ⇒ `?<id>` ⇒ 这一块永远重渲；
 *   · 段的时间边界**不放宽**（第一版放宽 0.5s，结果"改一个镜头重渲三块"）。
 *
 * @param {{
 *   root: string,
 *   engineSig: string,
 *   paramsText: string,
 *   timeline: Array<{ id: string, start: number, end: number, params?: any }>,
 *   index: { byId: Map<string, string[]> },
 *   from: number,
 *   to: number,
 *   stat?: (p: string) => { size: number, mtimeMs: number },
 * }} o
 * @returns {string}
 */
export function blockSignature(o) {
  const stat = o.stat ?? ((p) => statSync(p));
  const segs = (o.timeline ?? []).filter((it) => it.end > o.from && it.start < o.to);
  const parts = [`p:${o.paramsText}`, `e:${o.engineSig}`];
  for (const it of segs) {
    const files = o.index.byId.get(it.id);
    if (!files || !files.length) { parts.push(`?:${it.id}`); continue; }
    for (const rel of files) {
      try {
        const st = stat(path.join(o.root, rel));
        parts.push(`${rel}:${st.size}:${Math.round(st.mtimeMs)}`);
      } catch { parts.push(`${rel}:missing`); }
    }
    // 段参数（时间线上的 params）改了一样要重渲这一块
    parts.push(`params:${it.id}:${JSON.stringify(it.params ?? null)}`);
  }
  parts.sort();
  return parts.join('|');
}
