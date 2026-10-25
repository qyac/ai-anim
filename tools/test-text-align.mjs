#!/usr/bin/env node
// @ts-check
/**
 * `type.write` 的 **`align` 是「整行」还是「逐字」** —— 离线判据（BACKLOG 0-3）。
 *
 * 跑法：
 *   node tools/test-text-align.mjs
 *
 * ## 为什么要有这一份
 *
 * 引擎的 `write()` 是**逐字素簇** `fillText(cl, x + X[i])`，而 Canvas2D 的 `textAlign`
 * 对**每一次** `fillText` 都生效。所以最自然的写法（把 `align` 原样交给 canvas）会得到：
 *
 *   · `align: 'center'` → 每个字各自居中在自己的推进位置上 ⇒ 整行从 x **往右排**；
 *   · `align: 'right'`  → 每个字的右边缘对齐到 `x + X[i]` ⇒ 整行向右溢出约一个行宽。
 *
 * 这个坑在 `docs/ENGINE.md` / `AGENTS.md` / `COOKBOOK.md` 里被当成**引擎特性**写了很久
 * （"align 是逐字生效的，别用它做居中，要居中用 writeLine"）。真实后果是：
 * `src/shots/` 里 5 个模板（kinetic / outro / pulse / chart / title）的多字行**一直被裁**，
 * 而它一直没修，理由是「修它会改 demo 的画面、要重存 hashes 基线」——
 * 那条理由已经作废（BACKLOG §4，2026-10-24 用户拍板）。
 *
 * 现在 `align` 按整行算，与 `writeLine(..., { anchor })` **完全等价**。
 * 这一份测试钉住三件事（都不需要 GPU / Chrome）：
 *
 *   1. 单个调用内部的几何：给一个**假的 Canvas2D**（记录每次 `fillText` 的 x），
 *      真跑 `TextKit.write()`，量出第一个字与最后一个字的实际位置；
 *   2. 两种写法等价：`write({align})` 与 `writeLine({anchor})` 落点逐字节相同；
 *   3. 文档不再教旧的错法（`align` 的那些"逐字生效"论断要改成历史说明）。
 *
 * ⚠ 判据必须是**几何**的：只断言"代码里有某个字符串"证明不了对齐对不对
 * （第一版就是那么想的，而它同时被 5 个模板的错法证明是假的）。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TextKit } from '../src/core/text.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let passed = 0;
const lines = [];
/** @param {string} name @param {() => void} fn */
function t(name, fn) {
  try { fn(); passed++; lines.push(`  ✓ ${name}`); }
  catch (err) {
    lines.push(`  ✗ ${name}\n      ${String(err.message).split('\n').join('\n      ')}`);
    throw Object.assign(new Error(name), { cause: err });
  }
}

/* ------------------------------------------------------------------ 假 Canvas2D */

/**
 * 只实现 `TextKit` 用到的那几个成员。`measureText` 用**等宽**估算（每个 CJK 字 size×1，
 * 拉丁字母 size×0.55），这样期望值可以手算，判据不依赖任何真实字体。
 */
class Fake2D {
  constructor() {
    this.font = '';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.fillStyle = '';
    this.globalAlpha = 1;
    this.filter = 'none';
    /** @type {{ s: string, x: number, y: number, align: string }[]} */
    this.drawn = [];
    this._size = 64;
    this._family = 'sans';
  }

  save() {} restore() {}
  translate() {} scale() {}

  /** 从 `font` 里解出字号（`700 96px Sans` 这种形状） */
  get size() {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return m ? Number(m[1]) : 64;
  }

  measureText(s) {
    const size = this.size;
    const str = String(s);
    const wide = [...str].filter((c) => c.codePointAt(0) > 0x2e80).length;
    const narrow = [...str].length - wide;
    return { width: wide * size + narrow * size * 0.55 };
  }

  fillText(s, x, y) {
    if (!String(s).trim()) return;
    this.drawn.push({ s: String(s), x, y, align: this.textAlign });
  }

  /** 这一帧画出来的「墨迹范围」——只算真的有字形的那些 */
  get inkRange() {
    if (!this.drawn.length) return null;
    // 每个字的 ink 区间：等宽字体下就是 [x, x + 该字宽)
    let lo = Infinity; let hi = -Infinity;
    for (const d of this.drawn) {
      const w = this.measureText(d.s).width;
      lo = Math.min(lo, d.x);
      hi = Math.max(hi, d.x + w);
    }
    return { lo, hi, w: hi - lo, n: this.drawn.length };
  }
}

/** 造一个只跑一次的 TextKit（字体栈用默认的 `FAMILIES`，不加载任何东西）。 */
function kit() {
  const c = new Fake2D();
  return { type: new TextKit(/** @type {any} */ (c)), c };
}

const W = 1920;
const TEXT = '都是时间的函数';      // 7 个 CJK 字 —— demo 的 kinetic 第二行（一直会被裁的那一行）
const SIZE = 170;

/* ------------------------------------------------------------------ 1. 三种 align 的几何 */

t('align:"left" 时 x 就是整行左边缘（第一个字的左沿 = x）', () => {
  const { type, c } = kit();
  type.write(TEXT, 100, 500, { size: SIZE, align: 'left' });
  const r = c.inkRange;
  assert.ok(r, '一个字都没画');
  assert.equal(r.n, 7, `应画出 7 个字，实际 ${r.n}`);
  assert.equal(r.lo, 100, `左沿应在 100，实际 ${r.lo}`);
  assert.equal(c.drawn[0].align, 'left', 'fillText 时的 textAlign 必须是 left');
});

t('align:"center" 时 x 是整行中心（不是每个字各自居中）', () => {
  const { type, c } = kit();
  type.write(TEXT, W / 2, 500, { size: SIZE, align: 'center' });
  const r = c.inkRange;
  // 7 个 170px 的 CJK 字 = 1190 宽；居中 ⇒ 左沿 960 - 595
  assert.ok(Math.abs(r.w - 7 * SIZE) < 1e-6, `整行宽度应是 ${7 * SIZE}，实际 ${r.w}`);
  const center = (r.lo + r.hi) / 2;
  assert.ok(Math.abs(center - W / 2) < 1e-6,
    `整行中心应落在 ${W / 2}，实际 ${center}（差 ${(center - W / 2).toFixed(1)}px）`);
  assert.equal(c.drawn[0].align, 'left', 'fillText 时必须已经归成 left（否则每个字各自居中）');
});

t('align:"right" 时 x 是整行右边缘（最后一个字的右沿 = x）', () => {
  const { type, c } = kit();
  type.write(TEXT, 1800, 500, { size: SIZE, align: 'right' });
  const r = c.inkRange;
  assert.ok(Math.abs(r.hi - 1800) < 1e-6, `右沿应在 1800，实际 ${r.hi}`);
  assert.ok(Math.abs(r.lo - (1800 - 7 * SIZE)) < 1e-6, `左沿应在 ${1800 - 7 * SIZE}，实际 ${r.lo}`);
});

t('★ 回归本体：7 个字 170px 居中后**不出画**（BACKLOG 0-3 的那个真实事故）', () => {
  // 旧语义下这里会跑到 x ≈ 875..2029 —— 右边 109px 被切掉（跑场工具量出来的原话）
  const { type, c } = kit();
  type.write(TEXT, W / 2, 500, { size: SIZE, align: 'center' });
  const r = c.inkRange;
  assert.ok(r.lo >= 0, `左沿出了画面：${r.lo}`);
  assert.ok(r.hi <= W, `右沿出了画面：${r.hi} > ${W}（这正是修之前的样子）`);
});

/* ------------------------------------------------------------------ 2. 两种写法等价 */

t('write({align}) 与 writeLine({anchor}) 落点**逐字**相同', () => {
  for (const a of ['left', 'center', 'right']) {
    const A = kit();
    const B = kit();
    A.type.write(TEXT, 800, 500, { size: SIZE, align: a, tracking: 6 });
    B.type.writeLine(TEXT, 800, 500, { size: SIZE, anchor: a, tracking: 6 });
    const xa = A.c.drawn.map((d) => d.x);
    const xb = B.c.drawn.map((d) => d.x);
    assert.deepEqual(xa, xb, `align/anchor = ${a} 的落点不一致`);
    assert.deepEqual(A.c.drawn.map((d) => d.align), B.c.drawn.map((d) => d.align),
      `align/anchor = ${a} 时 fillText 的 textAlign 不一致`);
  }
});

t('writeLine 的返回值仍是整行宽度（含 tracking），与 measure 一致', () => {
  const { type } = kit();
  const w = type.writeLine(TEXT, 960, 500, { size: SIZE, anchor: 'center', tracking: 6 });
  const m = type.measure(TEXT, { size: SIZE, tracking: 6 });
  assert.ok(Math.abs(w - m) < 1e-9, `writeLine 返回 ${w}，measure 给 ${m}`);
  assert.ok(Math.abs(w - (7 * SIZE + 6 * 6)) < 1e-6, `含 tracking 的宽度应=${7 * SIZE + 36}，实际 ${w}`);
});

t('逐字动画（stagger）与 align 可以一起用：整体仍然居中', () => {
  const { type, c } = kit();
  // t 给得足够大 ⇒ 每个字都到位
  type.write(TEXT, W / 2, 500, {
    size: SIZE, align: 'center', stagger: 0.1, staggerDur: 0.4, t: 99,
  });
  const r = c.inkRange;
  assert.equal(r.n, 7, '所有字都该到位');
  const center = (r.lo + r.hi) / 2;
  assert.ok(Math.abs(center - W / 2) < 1e-6, `居中失效：中心 ${center}`);
});

t('单字字符串的三种 align：center 偏移半个字宽、right 偏移一个字宽（行为可预测）', () => {
  const one = 'A';
  const A = kit(); A.type.write(one, 500, 100, { size: 100, align: 'center' });
  const B = kit(); B.type.write(one, 500, 100, { size: 100, align: 'right' });
  const w = A.c.measureText(one).width;
  assert.ok(Math.abs(A.c.inkRange.lo - (500 - w / 2)) < 1e-6, 'center 应左移半个字宽');
  assert.ok(Math.abs(B.c.inkRange.lo - (500 - w)) < 1e-6, 'right 应左移一个字宽');
});

/* ------------------------------------------------------------------ 3. 文档不再教旧的错法 */

const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

t('三份文档都写明了这次修正（否则后来人会以为一直如此）', () => {
  for (const f of ['docs/ENGINE.md', 'docs/COOKBOOK.md', 'AGENTS.md']) {
    const s = read(f);
    assert.ok(/2026-10-24/.test(s), `${f} 没写修正日期`);
  }
});

t('AGENTS.md 不再把「align 是逐字生效」当结论（症状表里只能作为"已修的历史 bug"出现）', () => {
  const s = read('AGENTS.md');
  assert.ok(!/align` 是\*\*逐字\*\*生效的/.test(s), 'AGENTS 还写着"align 是逐字生效的"');
  assert.ok(!/别用它做居中/.test(s), 'AGENTS 还在说"别用 align 做居中"');
  // 症状表那一行必须是"已修"的口径（否则读者会照着旧结论去手算偏移）
  assert.ok(/\*\*已修\*\*（`align` 现在是整行对齐）/.test(s), '症状表那行没说清它已经修了');
});

t('COOKBOOK 明确禁止「自己算 x - measure/2」这种旧绕法', () => {
  const s = read('docs/COOKBOOK.md');
  assert.ok(/不要再自己算/.test(s), 'COOKBOOK 没提醒手工偏移会偏两次');
});

t('src/core/text.js 的 write() 里真的把整行宽度算进去了（不是只改注释）', () => {
  const s = read('src/core/text.js');
  assert.ok(/const lineW = cum\[cum\.length - 1\]/.test(s), '找不到整行宽度的计算');
  assert.ok(/const alignDx = align === 'center' \? -lineW \/ 2/.test(s), '找不到 center 的偏移');
  assert.ok(/x \+ X\[i\] \+ alignDx/.test(s), '逐字坐标没有加上 alignDx（改了注释没改画法）');
});

t('跑场工具的包围盒跟着引擎改了（否则它会开始误报出画）', () => {
  const s = read('tools/scene-harness.mjs');
  assert.ok(/align === 'center' \? x - w \/ 2/.test(s), 'scene-harness 还是逐字语义');
  assert.ok(!/const g0 = estW/.test(s), 'scene-harness 还留着"半个字宽"的旧估计');
});

/* ------------------------------------------------------------------ 汇总 */

console.log(`\ntype.write 的 align（整行对齐 / BACKLOG 0-3） —— ${passed} 项\n`);
for (const line of lines) console.log(line);
console.log('');
