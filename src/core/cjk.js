// @ts-check
/**
 * 字幕的**中日文断行**（纯函数）。
 *
 * 为什么单独一层：`type.wrap()` 是按宽度贪心切的 —— 对中文来说它会把
 * `，` `。` `」` 切到行首、把 `（` `「` 留在行尾，也就是所谓"**禁则**"没做；
 * 而且 16 字一行时容易出现 15 + 1 这种"**孤儿行**"。这两件事在字幕里一眼就能看出来。
 *
 * 规则（与 Netflix 简体中文 timed-text 规范、以及日本字幕的慣例一致）：
 *   1. **行首禁则**：`，。、；：！？）」』】…·%` 这类字符不许出现在行首 ——
 *      放不下就把它**挂在上一行末尾**（悬挂，允许溢出 1 个字宽）；
 *   2. **行尾禁则**：`（「『【` 这类开引号不许留在行尾 —— 把它**推到下一行**；
 *   3. **不拆词**：连续的拉丁字母 / 数字 / 小数点算一个整体（`24fps` 不会被切成 `24f` / `ps`）；
 *   4. **两行要平衡**：能断成两行时不让它变成 15 + 1（在接近中点、且优先在标点处断）；
 *   5. **不丢字**：放不下就交给调用方缩字号或加行 —— 这里**绝不截断**
 *      （以前的实现对超长句 `rows.slice(0, maxLines)`，等于直接吃掉了后半句）。
 *
 * 宽度单位：一个全角字 = 1，一个拉丁字符 = 0.55（与 `captions.js` 的 `widthFor` 同口径）。
 */

/** 不许出现在**行首**的字符（标点、闭引号、闭括号、单位符号） */
const NO_START = new Set([...'，。、；：！？）」』】〉》·…‰%％,.;:!?)]}>\'"”’']);
/** 不许出现在**行尾**的字符（开引号、开括号） */
const NO_END = new Set([...'（「『【〈《([{<\'"“‘']);

/** 一个字符的"宽度单位"：全角 1，拉丁 0.55 */
export function widthOf(ch) {
  return /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55;
}

/**
 * 切成**不可拆**的单元。
 * 拉丁字母 / 数字 / 小数 / 连字符 / 斜杠连成一个单元；其他按单个字符。
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  for (const ch of String(text)) {
    if (/[A-Za-z0-9]/.test(ch)) { buf += ch; continue; }
    if (buf && /[.\-_/:%]/.test(ch) && /[A-Za-z0-9]/.test(buf[buf.length - 1] ?? '')) { buf += ch; continue; }
    flush();
    out.push(ch);
  }
  flush();
  return out;
}

/** 一个单元占几个宽度单位 */
function unitWidth(tok) {
  let w = 0;
  for (const ch of tok) w += widthOf(ch);
  return w;
}

/**
 * 把文字断成若干行。
 *
 * @param {string} text
 * @param {{ maxChars?: number, maxLines?: number }} [o]
 *   `maxChars` = 一行最多几个全角字（默认 16）；`maxLines` 只是**期望上限**，
 *   放不下时本函数会多给行（`overflow: true`），由调用方决定缩字号还是接受
 * @returns {{ rows: string[], overflow: boolean, widest: number }}
 */
export function breakCaption(text, o = {}) {
  const maxChars = Math.max(4, o.maxChars ?? 16);
  const want = Math.max(1, o.maxLines ?? 2);
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return { rows: [], overflow: false, widest: 0 };

  const toks = tokenize(s);

  // ① 贪心装行
  /** @type {{ toks: string[], w: number }[]} */
  const lines = [];
  let cur = { toks: [], w: 0 };
  for (const t of toks) {
    const tw = unitWidth(t);
    if (cur.w + tw > maxChars + 1e-9 && cur.toks.length) {
      lines.push(cur);
      cur = { toks: [], w: 0 };
    }
    cur.toks.push(t);
    cur.w += tw;
  }
  if (cur.toks.length) lines.push(cur);

  // ② 禁则：行首的闭标点挂到上一行末尾（最多溢出一个字宽）
  for (let i = 1; i < lines.length; i++) {
    while (lines[i].toks.length > 1 && NO_START.has(lines[i].toks[0]) && lines[i - 1].w < maxChars + 1.2) {
      const ch = lines[i].toks.shift();
      lines[i].w -= unitWidth(ch);
      lines[i - 1].toks.push(ch);
      lines[i - 1].w += unitWidth(ch);
    }
    // ③ 行尾禁则：开引号推到下一行
    if (lines[i - 1].toks.length > 1 && NO_END.has(lines[i - 1].toks[lines[i - 1].toks.length - 1])) {
      const ch = lines[i - 1].toks.pop();
      lines[i - 1].w -= unitWidth(ch);
      lines[i].toks.unshift(ch);
      lines[i].w += unitWidth(ch);
    }
  }

  // ④ 两行平衡：第一行明显过长时，把断点往前挪到"最接近中点"的标点/空格处
  if (lines.length === 2 && lines[0].w > (lines[1].w + 1) * 1.4) {
    const all = toks;
    const total = all.reduce((a, t) => a + unitWidth(t), 0);
    const half = total / 2;
    let best = -1;
    let bestScore = Infinity;
    let acc = 0;
    for (let i = 1; i < all.length; i++) {
      acc += unitWidth(all[i - 1]);
      if (Math.abs(acc - half) > Math.max(3, maxChars * 0.45)) continue;
      const prev = all[i - 1];
      const next = all[i];
      // 优先在标点/空格后断；其次在接近中点处断
      const punct = /[，。、；：！？）」』,.;:!?\s]/.test(prev) ? 0 : 1;
      const score = Math.abs(acc - half) + punct * 2;
      // 断在行首禁则字符之前 = 合法
      if (NO_START.has(next) && acc < half) continue;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best > 0) {
      const a = all.slice(0, best);
      const b = all.slice(best);
      lines[0] = { toks: a, w: a.reduce((x, t) => x + unitWidth(t), 0) };
      lines[1] = { toks: b, w: b.reduce((x, t) => x + unitWidth(t), 0) };
    }
  }

  const rows = lines.map((l) => l.toks.join('').trim()).filter((r) => r.length > 0);
  const widest = rows.reduce((m, r) => Math.max(m, [...r].reduce((a, ch) => a + widthOf(ch), 0)), 0);
  return { rows, overflow: rows.length > want, widest };
}

export const CJK_RULES = { NO_START, NO_END };
