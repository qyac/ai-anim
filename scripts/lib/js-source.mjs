// @ts-check
/**
 * JS 源码的逐字符扫描（Node 侧共用）。
 *
 * 两个 lint 工具（`tools/lint-narration-dup.mjs` / `tools/lint-fabricated-numbers.mjs`）
 * 和 `scripts/anim.mjs` 的镜头依赖扫描，都要做同一件事：**只把注释换成等长空白**，
 * 字符串字面量与换行原样保留 —— 于是"下标 → 行号"不需要任何映射表，报出来的
 * `文件:行号` 必然和编辑器里看到的一致。
 *
 * 以前三处各抄了一份状态机（其中两份 `scanSource` 逐字相同）。这里只留一份；
 * 要改扫描规则（例如支持正则字面量）就改这里，三处一起生效。
 */

/**
 * 逐字符扫一遍源码，得到：
 *   · `code`     —— 注释被替换成**等长空白**（换行原样保留）之后的文本：匹配只用它；
 *   · `strings`  —— 每个字符串字面量的 `[start, end)`（含两头的引号）；
 *   · `comments` —— 每个注释的 `[start, end)` 与 `kind`（'line' / 'block'）；
 *   · `unterminated` —— 扫到文件尾还没闭合（多半是含引号的正则把状态带歪了）→ 要提示。
 *
 * 为什么不用正则删注释：分不清 `'https://…'` 里的 `//` 与真注释；
 * 也分不清注释里的引号（那不算字符串）。
 *
 * @param {string} raw
 */
export function scanSource(raw) {
  let code = '';
  /** @type {{start: number, end: number}[]} */
  const strings = [];
  /** @type {{start: number, end: number, kind: 'line'|'block'}[]} */
  const comments = [];
  let state = /** @type {'code'|'line'|'block'|"'"|'"'|'`'} */ ('code');
  let start = 0;
  const n = raw.length;
  for (let i = 0; i < n;) {
    const c = raw[i];
    const c2 = raw[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; start = i; code += '  '; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; start = i; code += '  '; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { state = c; start = i; code += c; i++; continue; }
      code += c; i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { comments.push({ start, end: i, kind: 'line' }); state = 'code'; code += c; i++; continue; }
      code += ' '; i++; continue;                       // 行注释内容 → 空白
    }
    if (state === 'block') {
      if (c === '*' && c2 === '/') {
        comments.push({ start, end: i + 2, kind: 'block' });
        state = 'code'; code += '  '; i += 2; continue;
      }
      // 换行保留（行号靠它），其余（含行内 `*`）→ 空白
      code += c === '\n' ? '\n' : ' '; i++; continue;
    }
    // 字符串内部：内容**原样保留**（那才是画面文字），只是要找对收尾的引号
    if (c === '\\') { code += c + (c2 ?? ''); i += 2; continue; }
    if (c === state) { strings.push({ start, end: i + 1 }); state = 'code'; code += c; i++; continue; }
    code += c; i++; continue;
  }
  if (state === 'line' || state === 'block') comments.push({ start, end: n, kind: state });
  return { code, strings, comments, unterminated: state !== 'code' && state !== 'line' };
}

/** 字面量的内容（去掉两头的引号）。反引号里的 `${…}` 原样留着 —— 它里面的字面量本来也算画面文字 */
export const literalInner = (raw, span) => raw.slice(span.start + 1, span.end - 1);

/** 某个下标在第几行（1 起） */
export function lineAt(raw, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < raw.length; i++) if (raw[i] === '\n') line++;
  return line;
}

/** 某个下标所在行的原文（trim 过，给报告里当证据看） */
export function lineTextAt(raw, offset) {
  const a = raw.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  let b = raw.indexOf('\n', offset);
  if (b < 0) b = raw.length;
  return raw.slice(a, b).trim();
}

/**
 * 只要"注释变空白、其余原样"的那个文本（`scripts/anim.mjs` 的镜头模板依赖扫描用）。
 * @param {string} src
 */
export function blankJsComments(src) {
  return scanSource(String(src ?? '')).code;
}
