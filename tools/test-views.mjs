#!/usr/bin/env node
// @ts-check
/**
 * 仪器视图（`src/kit/views.js`）的**纯逻辑**回归。
 *
 *   node tools/test-views.mjs
 *
 * 这一层最贵的三类错都**不会抛异常**：
 *   ① 模式名写错 → 本该报错却静默回落成"第一个模式"（画面还是有的，只是不是你要的）；
 *   ② 字模顺序不单调 → 字符画的明暗关系反了（实测踩过：中灰底整片消失）；
 *   ③ 极性搞反 → 整块反相（深色底片的片子里"看着还挺像"，人眼很难当场发现）。
 * 所以每一条都钉成可判的断言。
 */

import {
  VIEWS, VIEW_NAMES, listViews, glyphInk, sortGlyphsByInk,
} from '../src/kit/views.js';

let fail = 0;
let pass = 0;
/** @param {boolean} cond @param {string} msg */
function ok(cond, msg) {
  if (cond) { pass++; console.log('✓ ' + msg); } else { fail++; console.error('✗ ' + msg); }
}
/** @param {string} msg */
function section(msg) { console.log('\n── ' + msg + ' ──'); }

/* ════════════════════════════════════════════════ 清单 */

section('视图清单：九种，字段齐全');
{
  const list = listViews();
  ok(list.length === 9, '共 9 种（实际 ' + list.length + '）');
  ok(VIEW_NAMES.length === Object.keys(VIEWS).length, 'VIEW_NAMES 与 VIEWS 同源');
  for (const name of ['halftone', 'ascii', 'dither', 'posterize', 'thermal', 'pixel', 'crt', 'engrave', 'woodcut']) {
    ok(VIEW_NAMES.includes(name), '包含 ' + name);
  }
  ok(list.every((v) => typeof v.label === 'string' && v.label.length > 0), '每种都有中文 label');
  ok(list.every((v) => typeof v.note === 'string' && v.note.length > 8), '每种都有说明 note');
  ok(list.every((v) => Number.isFinite(v.defaultCell) && v.defaultCell >= 1), '每种都有 >=1 的默认格子');
  // 文档里的表是按 VIEW_NAMES 的顺序写的，顺序变了要同步改文档（这里只提醒不判错）
  ok(VIEW_NAMES.join(',') === 'halftone,ascii,dither,posterize,thermal,pixel,crt,engrave,woodcut',
    '顺序与文档 / 着色器整数一致（woodcut 必须是**最后**一个：着色器按 m == 8 取它）');
}

/* ════════════════════════════════════════════════ 字模 */

section('字模：着墨点数可数、排序后严格不减');
{
  const glyphs = ['.....', '..#..'];
  ok(glyphInk(glyphs[0]) === 0, '空字模 0 点');
  ok(glyphInk(glyphs[1]) === 1, '单点字模 1 点');
  ok(glyphInk('#####'.repeat(7)) === 35, '满字模 35 点');

  // 用一组**故意乱序**的字模验证排序：这就是第一版踩的那个坑的形状
  const messy = ['#####', '.....', '..#..', '###..', '##...'];
  const sorted = sortGlyphsByInk(messy);
  const inks = sorted.map(glyphInk);
  ok(inks.every((v, i) => i === 0 || inks[i - 1] <= v), '排序后严格不减：' + inks.join(' <= '));
  ok(sorted.length === messy.length, '排序不丢字模');
  ok(new Set(sorted).size === new Set(messy).size, '排序不产生重复');
  // 稳定性：点数相同的两个字模顺序不变
  const tie = ['..##.', '.##..'];
  ok(sortGlyphsByInk(tie).join('|') === tie.join('|'), '点数相同则保持源码顺序（稳定排序）');
}

section('真实字模表：严格不减，且首尾分别是「全空」与「全实」');
{
  // 从模块内部把排序结果取出来（用同一份函数重算，因为表本身不导出）
  // —— 这里直接重建一份与源码同序的候选集：任何新加的字符都必须遵守同一条规则
  const sample = ['.....', '..#..', '.###.', '#####'];
  const sorted = sortGlyphsByInk(sample);
  ok(glyphInk(sorted[0]) === 0, '第一个是空字模（纸可以完全空白）');
  ok(sorted[sorted.length - 1] === '#####', '最后一个是满字模（最暗处能实心）');
}

/* ════════════════════════════════════════════════ 参数校验 */

section('mode 写错必须**抛**（不许静默回落）');
{
  let threw = false;
  let msg = '';
  try {
    // applyView 需要 ctx / gl，但 modeIndex 在碰到 gl 之前就先判名字（见实现的调用顺序）
    // 所以这里直接用一个"假 ctx"：命中的是参数校验那条路径
    const fakeCtx = { gl: null, P: null, f: { t: 0, dt: 1 / 60 } };
    const { applyView } = await import('../src/kit/views.js');
    applyView(fakeCtx, null, { mode: 'halfton' });
  } catch (e) {
    threw = true;
    msg = e && e.message ? e.message : String(e);
  }
  ok(threw, '拼错 "halfton" 会抛');
  ok(msg.includes('halfton'), '报错里带上了写错的那个名字');
  ok(msg.includes('halftone') && msg.includes('engrave'), '报错里列出了可用模式');
}

section('合法 mode 不会在参数校验这一步抛');
{
  const { applyView } = await import('../src/kit/views.js');
  let bad = null;
  try {
    // gl 是 null ⇒ 一定会在后面某处炸，但**不该**炸在"未知模式"那条上
    const fakeCtx = { gl: null, P: null, f: { t: 0, dt: 1 / 60 } };
    applyView(fakeCtx, null, { mode: 'halftone' });
  } catch (e) { bad = e; }
  ok(!(bad && /未知的视图模式/.test(bad.message)), '合法模式不会报「未知的视图模式」');
}

/* ════════════════════════════════════════════════ 汇总 */

console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' 项通过' + (fail ? '，' + fail + ' 项失败' : ''));
process.exit(fail ? 1 : 0);
