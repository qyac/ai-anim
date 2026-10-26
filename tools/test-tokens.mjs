#!/usr/bin/env node
// @ts-check
/**
 * 设计 token 的语义字号 —— **纯逻辑**回归（不需要 GPU / 浏览器，几毫秒跑完）。
 *
 *   node tools/test-tokens.mjs
 *
 * 为什么值得单测：`size: 'hero'` 是**给模型写的接口**（BACKLOG 1-46）。
 * 它有两种必须钉住的失败模式：
 *   ① **静默回落**：名字拼错（`'heor'`）如果被当成 `undefined`，字号就退到默认 64 ——
 *      不报错、画面看起来"也还行"，这是最贵的错法。这里断言它**必须抛**。
 *   ② **取值不跟风格走**：语义字号的意义就是"同一份场景换风格后层级还在"，
 *      所以解析必须吃到这套风格的 token（`ctx.style.tokens`），而不是永远读 TOKENS。
 *
 * 另外钉住底线：**数字原样通过、不传就交给调用方默认值** —— 老场景（120 个文件里
 * 全是 `size: 24` 这种数字）一个像素都不能变。
 */

import {
  TOKENS, BEFORE_TOKENS, TYPE_SCALE, tokensWith, resolveTypeSize,
} from '../src/style/tokens.js';
import { STYLES, resolveStyle } from '../src/style/index.js';

let fail = 0;
let pass = 0;
/** @param {boolean} cond @param {string} msg */
function ok(cond, msg) {
  if (cond) { pass++; console.log(`✓ ${msg}`); } else { fail++; console.error(`✗ ${msg}`); }
}
/** @param {string} msg */
function section(msg) { console.log(`\n── ${msg} ──`); }

/* ------------------------------------------------------------ 底线：不改变老行为 */

section('底线：数字原样通过（老场景零变化）');
ok(resolveTypeSize(24) === 24, '数字 24 → 24（不做任何换算）');
ok(resolveTypeSize(136.5) === 136.5, '小数原样保留');
ok(resolveTypeSize(undefined) === undefined, '不传 → undefined（交给调用方默认 64）');
ok(resolveTypeSize(null) === undefined, 'null → undefined');
let threw = false;
try { resolveTypeSize(0); } catch { threw = true; }
ok(threw, 'size: 0 直接抛（0 号字是"整行隐形"的经典 bug）');
threw = false;
try { resolveTypeSize(-12); } catch { threw = true; }
ok(threw, '负数字号直接抛');
threw = false;
try { resolveTypeSize(NaN); } catch { threw = true; }
ok(threw, 'NaN 直接抛');

/* ------------------------------------------------------------ 语义字号 → 像素 */

section('语义字号：默认 token 表');
ok(TYPE_SCALE.length === 6, `阶梯有 6 档：${TYPE_SCALE.join(' / ')}`);
ok(resolveTypeSize('hero') === TOKENS.type.hero, `'hero' → ${TOKENS.type.hero}`);
ok(resolveTypeSize('label') === TOKENS.type.label, `'label' → ${TOKENS.type.label}`);
for (const k of TYPE_SCALE) {
  ok(resolveTypeSize(k) === TOKENS.type[k], `'${k}' → TOKENS.type.${k}`);
}
ok(resolveTypeSize('hero') > resolveTypeSize('body'), 'hero 比 body 大（层级方向对）');
ok(resolveTypeSize('body') > resolveTypeSize('label'), 'body 比 label 大');
ok(resolveTypeSize('hero') / resolveTypeSize('h2') >= 2, 'hero / h2 ≥ 2×（§2.2 的比例要求）');

/* ------------------------------------------------------------ 写错必须抛 */

section('写错必须抛（不许静默回落）');
threw = false;
try { resolveTypeSize('heor'); } catch (e) {
  threw = true;
  const msg = String(/** @type {any} */ (e).message);
  ok(msg.includes('heor'), '报错里带上了写错的名字');
  ok(msg.includes('hero'), '报错里列出了可用名字（hero）');
  ok(msg.includes('label'), '报错里列出了全部候选（label）');
}
ok(threw, "拼错的 'heor' 必须抛，不许回落到 64");
threw = false;
try { resolveTypeSize('136'); } catch { threw = true; }
ok(threw, "字符串 '136' 也抛（要数字就写数字，别写带引号的）");

/* ------------------------------------------------------------ 风格覆盖 */

section('风格包覆盖：同一份场景换风格，层级还在');
const widened = tokensWith({ type: { hero: 168 } });
ok(resolveTypeSize('hero', widened) === 168, '覆盖后 hero → 168');
ok(resolveTypeSize('body', widened) === TOKENS.type.body, '没覆盖的档位仍是默认值（deep merge）');
ok(widened.type.hero > TOKENS.type.hero, '覆盖值确实变了（不是原地改 TOKENS）');
ok(TOKENS.type.hero === 136, 'TOKENS 本体没被 tokensWith 改脏');

section('每一套风格都能解析全部 6 档（没有半截 token 表）');
for (const name of Object.keys(STYLES)) {
  const style = resolveStyle(name);
  const bad = TYPE_SCALE.filter((k) => typeof resolveTypeSize(k, style.tokens) !== 'number');
  ok(bad.length === 0, `${name}: ${TYPE_SCALE.length - bad.length}/6 档可解析${bad.length ? `（缺 ${bad.join(',')}）` : ''}`);
}
const flatStyle = resolveStyle('flat');
ok(flatStyle.tokens.type.hero > 0, 'flat 的 tokens 已接出来（ctx.style.tokens）');

/* ------------------------------------------------------------ BEFORE_TOKENS 的定位 */

section('BEFORE_TOKENS 只给对比图用');
ok(BEFORE_TOKENS.type.hero < TOKENS.type.hero / 4, '「改造前」的 hero 只有 24（实测分布）');
ok(BEFORE_TOKENS.type.label >= 15 && BEFORE_TOKENS.type.label <= 30, '「改造前」的字号挤在 15–30px');
ok(resolveTypeSize('hero', BEFORE_TOKENS) === 24, "'hero' 在 BEFORE 表里也能解析（对比图两条路同源）");

/* ------------------------------------------------------------ 汇总 */

console.log(`\n${fail ? `✗ ${fail} 项失败` : `✓ ${pass} 项全部通过`}（共 ${pass + fail} 项）`);
process.exit(fail ? 1 : 0);
