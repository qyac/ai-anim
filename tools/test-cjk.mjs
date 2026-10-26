#!/usr/bin/env node
// @ts-check
/**
 * 字幕断行的**纯逻辑**回归（中日文禁则 + 平衡 + 不丢字）。
 *
 *   node tools/test-cjk.mjs
 *
 * 为什么值得单测：断行错了不会报错 —— 只会让字幕"行首一个句号"或"第二行只剩一个字"，
 * 而这类毛病是观众第一眼就看见的。更糟的是旧实现在超长句上**直接截断**（丢字），
 * 这里用 `rows.join('') === 原文` 钉死"一个字都不许少"。
 */

import { breakCaption, tokenize, widthOf, CJK_RULES } from '../src/core/cjk.js';

let fail = 0;
let pass = 0;
/** @param {boolean} cond @param {string} msg */
function ok(cond, msg) {
  if (cond) { pass++; console.log(`✓ ${msg}`); } else { fail++; console.error(`✗ ${msg}`); }
}
/** @param {string} msg */
function section(msg) { console.log(`\n── ${msg} ──`); }

const strip = (rows) => rows.join('');

/* ════════════════════════════════════════ 基本行为 */

section('基本：空串 / 短句 / 单字');
{
  ok(breakCaption('').rows.length === 0, '空串 ⇒ 0 行');
  ok(breakCaption('   ').rows.length === 0, '全空白 ⇒ 0 行');
  const short = breakCaption('先看一句话。');
  ok(short.rows.length === 1 && short.rows[0] === '先看一句话。', '短句 ⇒ 原样一行');
  const one = breakCaption('字');
  ok(one.rows.length === 1 && one.rows[0] === '字', '单字也成行');
}

section('宽度单位：全角 1 / 拉丁 0.55');
{
  ok(widthOf('字') === 1, '汉字 = 1');
  ok(Math.abs(widthOf('，') - 1) < 1e-9, '全角标点 = 1');
  ok(Math.abs(widthOf('a') - 0.55) < 1e-9, '拉丁字母 = 0.55');
}

section('不拆词：拉丁词 / 数字 / 小数算整体');
{
  const t = tokenize('24fps 和 v0.9.0 不能拆');
  ok(t.includes('24fps'), '`24fps` 是一个单元');
  ok(t.includes('v0.9.0'), '`v0.9.0` 是一个单元');
  const r = breakCaption('这一句里有一个很长的词 v0.9.0 必须保持完整', { maxChars: 8 });
  ok(r.rows.some((row) => row.includes('v0.9.0')), '断行后 `v0.9.0` 仍完整在某一整行里');
  ok(!r.rows.some((row) => /v0\.9\.?$/.test(row) && !row.includes('v0.9.0')), '没有被切开');
}

/* ════════════════════════════════════════ 禁则 */

section('行首禁则：句号/逗号/闭引号不许出现在行首');
{
  // 让"。"恰好落在行首的位置
  const text = '前面这一句很长很长很长。后面还有';
  const r = breakCaption(text, { maxChars: 8, maxLines: 2 });
  for (const row of r.rows.slice(1)) {
    ok(!CJK_RULES.NO_START.has(row[0]), `行首不是禁则字符（实际「${row[0]}」）`);
  }
  ok(strip(r.rows) === text, '不丢字（拼回去 == 原文）');
}

section('行尾禁则：开引号不许留在行末');
{
  const text = '他说「这句话很重要」然后停了很久';
  const r = breakCaption(text, { maxChars: 7, maxLines: 3 });
  for (const row of r.rows.slice(0, -1)) {
    ok(!CJK_RULES.NO_END.has(row[row.length - 1]), `行尾不是开引号（实际「${row[row.length - 1]}」）`);
  }
  ok(strip(r.rows) === text, '不丢字');
}

/* ════════════════════════════════════════ 平衡 */

section('两行平衡：不许出现 15 + 1 的孤儿行');
{
  const text = '这一句话有十七个字左右用来测试平衡断行的效果';
  const r = breakCaption(text, { maxChars: 16, maxLines: 2 });
  ok(r.rows.length === 2, `断成 2 行（实际 ${r.rows.length}）`);
  const [a, b] = r.rows.map((row) => [...row].length);
  ok(Math.min(a, b) >= Math.max(3, Math.floor(Math.max(a, b) * 0.45)),
    `两行长度 ${a} / ${b} 不像孤儿行`);
  ok(strip(r.rows) === text, '不丢字');
}

/* ════════════════════════════════════════ 不丢字 / 溢出 */

section('超长句：给更多行 + overflow 标记，**绝不截断**');
{
  const long = '这是一句特别特别长的话'.repeat(4);
  const r = breakCaption(long, { maxChars: 12, maxLines: 2 });
  ok(strip(r.rows) === long, '拼回去 == 原文（没吃掉后半句）');
  ok(r.overflow === true, 'overflow=true（叫调用方去缩字号）');
  ok(r.rows.length > 2, `行数 ${r.rows.length} > maxLines=2 —— 宁可多一行也不丢字`);
  const normal = breakCaption('短句', { maxChars: 12, maxLines: 2 });
  ok(normal.overflow === false, '对照：正常句子 overflow=false');
}

section('标点在前 / 连续标点 / emoji 边界不炸');
{
  const r1 = breakCaption('「好。」他说。');
  ok(strip(r1.rows) === '「好。」他说。', '引号句原样');
  const r2 = breakCaption('等等……还有……');
  ok(strip(r2.rows) === '等等……还有……', '省略号原样');
  const r3 = breakCaption('表情😀也要能断！');
  ok(strip(r3.rows) === '表情😀也要能断！', 'emoji 不破坏拼接');
  const r4 = breakCaption('A'.repeat(40), { maxChars: 10 });
  ok(strip(r4.rows) === 'A'.repeat(40), '超长无空格串也不丢字');
}

section('确定性：同样输入两次结果一致');
{
  const text = '凌晨四点的便利店，灯比人清醒。';
  const a = breakCaption(text, { maxChars: 10, maxLines: 2 });
  const b = breakCaption(text, { maxChars: 10, maxLines: 2 });
  ok(JSON.stringify(a) === JSON.stringify(b), '逐行相同');
}

console.log(`\n${fail ? `✗ ${fail} 项失败` : `✓ ${pass} 项全部通过`}（共 ${pass + fail} 项）`);
process.exit(fail ? 1 : 0);
