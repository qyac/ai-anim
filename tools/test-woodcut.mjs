#!/usr/bin/env node
// @ts-check
/**
 * **多方向排线（木刻 / 铜版）**（`src/kit/views.js` 的 `woodcut` 模式）—— 离线单测。
 * 不需要 GPU / 浏览器 / Vite：
 *
 *   node tools/test-woodcut.mjs
 *
 * 钉的是 BACKLOG **1-68**（素材包缺口表第 10 行，覆盖 L30 L31 O3 O10 Z10）。
 * 这一层有**五条**写错不报错、只出错画面的纪律，每一条都是出图之后才补上的：
 *
 *   ① 每加一层，那层的线更细（否则三层叠起来立刻饱和成实黑）；
 *   ② 层与层的边界要抖（硬切会在中间调上出一块块"补丁"）；
 *   ③ 线要断，但**段要长**（第一版 3 格一段，出图是一排点划线）；
 *   ④ 明暗要取**局部平均**，且半径要盖住底图的最小特征尺度（`fillRect` 的行距）；
 *   ⑤ 线距不能逼近像素栅格（12px 时 45° 线的投影 8.5px 与行距凑成近整数比 ⇒
 *      整屏次谐波横带）。所以默认 22px，并有 `WOODCUT_MIN_CELL` 下限保护。
 *
 * 这些都是**着色器里的常数**，纯 JS 测不到像素；所以这里钉的是**源码事实**：
 * 常数有没有被改回去、下限保护还在不在、分支还在不在。
 * 这一层的"对不对"只能靠出图（`tasks/_hatch-lab` 与 `_hatch-lab-eng` 两页并排看）。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { VIEWS, VIEW_NAMES, WOODCUT_MIN_CELL } from '../src/kit/views.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const SRC = read('src/kit/views.js');

let passed = 0;
const failed = [];
function t(name, fn) {
  try { fn(); passed++; }
  catch (err) {
    failed.push('  x ' + name + '\n      '
      + String(err && err.message ? err.message : err).split('\n').join('\n      '));
  }
}

/* ═══════ 1. 登记与顺序 ═══════ */

t('woodcut 在视图表里，且有 label / note / 默认格子', () => {
  assert.ok(VIEWS.woodcut, 'VIEWS 里没有 woodcut');
  assert.equal(typeof VIEWS.woodcut.label, 'string');
  assert.ok(VIEWS.woodcut.note.length > 20, 'note 太短 —— 后来的人不知道它与 engrave 的差别');
  // 说明必须点出「加方向」这件事 —— 否则读者分不清它与 engrave 的差别（那正是这条的全部意义）
  assert.ok(/交叉|加方向|cross/i.test(VIEWS.woodcut.note), 'note 没说明"按明暗加方向"');
  assert.equal(VIEWS.woodcut.needs, 'luma', 'woodcut 只用亮度，不该声明 rgb');
});

t('woodcut 是**最后一个**视图（着色器按 m == 8 取它，顺序变了就取到别人）', () => {
  assert.equal(VIEW_NAMES[VIEW_NAMES.length - 1], 'woodcut');
  assert.equal(VIEW_NAMES.indexOf('woodcut'), 8);
});

t('WOODCUT_MIN_CELL 是 22（次谐波下限；改小就是让整屏长出横带）', () => {
  assert.equal(WOODCUT_MIN_CELL, 22);
  assert.ok(SRC.includes('woodcut: 22 }'), 'DEFAULT_CELL 里 woodcut 的默认值不是 22');
});

/* ═══════ 2. 五条纪律（源码事实） ═══════ */

t('① 每层更细：halfPx 随层号**递减**（写反 ⇒ 三层叠成实黑）', () => {
  // ① 的判据是**递减**，不是常数：直接解出两个系数来判
  const m = SRC.match(/float halfPx = ([\d.]+) - ([\d.]+) \* fi;/);
  assert.ok(m, '找不到 halfPx 的递减式（第一版是 0.9 - 0.15*fi）');
  assert.ok(Number(m[2]) > 0, 'halfPx 没有随层号递减 —— 三层叠起来会饱和成实黑');
  assert.ok(Number(m[1]) - 2 * Number(m[2]) > 0, '第三层的线宽已经 <= 0，等于没画');
});

t('② 层边界有抖动：门槛上要加 bayer（硬切会在中间调出补丁）', () => {
  assert.ok(/float bayer = \(bayer4\(px\) - 0\.5\)/.test(SRC), '门槛没加 bayer');
  assert.ok(/float on = step\(gate \+ bayer, dark\)/.test(SRC), 'bayer 没进门槛比较');
});

t('③ 断线的**段长** ≥ 8 格（第一版 3 格 ⇒ 出图是一排点划线）', () => {
  const m = SRC.match(/float seg = floor\(along \/ \(freq \* ([\d.]+)\)\)/);
  assert.ok(m, '找不到断线分段');
  const n = Number(m[1]);
  assert.ok(n >= 8, '段长只有 ' + n + ' 格 —— 会退化成虚线');
});

t('④ 明暗取**局部平均**，且采样点 ≥ 20 个（单点采样会与底纹拍频）', () => {
  const m = SRC.match(/for \(int i = 0; i < (\d+); i\+\+\) \{\s*\n\s*float fi = float\(i\) \+ 0\.5;/);
  assert.ok(m, '找不到螺旋采样循环');
  assert.ok(Number(m[1]) >= 20, '只有 ' + m[1] + ' 个采样点，低通不够');
  assert.ok(/2\.39996/.test(SRC), '采样角不是黄金角（会与排线锁相）');
});

t('⑤ 下限保护在（woodcut 的 cell 小于 22 要被夹住并留痕）', () => {
  assert.ok(SRC.includes('function viewCellOf'), '没有 viewCellOf');
  assert.ok(/ctx\.warnings\.push\('woodcut 的 cell/.test(SRC), '夹住时没有留痕');
  assert.ok(SRC.includes('cell: viewCellOf(opts, ctx)'), 'applyView 没走 viewCellOf');
});

/* ═══════ 3. 与 engrave 的差别必须是真的 ═══════ */

t('engrave 与 woodcut 是两个分支（不是同一个模式的别名）', () => {
  assert.ok(SRC.includes('} else if (m == 7)'), 'engrave 分支不见了');
  assert.ok(SRC.includes('} else if (m == 8)'), 'woodcut 分支不见了');
});

t('woodcut 有三层方向（for layer < 3），每层角度错 30°', () => {
  assert.ok(/for \(int layer = 0; layer < 3; layer\+\+\)/.test(SRC), '不是三层');
  assert.ok(/0\.5236/.test(SRC), '没有 30° 的层间角度差');
});

t('排线类默认 45°（engrave / woodcut 都要；27° 会读成扫描线）', () => {
  assert.ok(/opts\.mode === 'engrave' \|\| opts\.mode === 'woodcut' \? Math\.PI \/ 4/.test(SRC),
    'woodcut 没进 45° 那一支');
});

/* ═══════ 4. 接线 ═══════ */

t('回归清单挂上了这条（加测试只改清单，不要改 verify.yml）', () => {
  assert.ok(read('tools/regress-all.mjs').includes('test-woodcut.mjs'), 'regress-all.mjs 里没有 test-woodcut');
});

t('夹具在（_hatch-lab 多方向 / _hatch-lab-eng 单方向，两份只差 style.view 一行）', () => {
  const a = read('tasks/_hatch-lab/task.config.mjs');
  const b = read('tasks/_hatch-lab-eng/task.config.mjs');
  assert.ok(a.includes('mode: \'woodcut\''), '_hatch-lab 不是 woodcut');
  assert.ok(b.includes('mode: \'engrave\''), '_hatch-lab-eng 不是 engrave');
  // ⚠ 只比**配置语义**（style + timeline），不比注释与标题 —— 注释里本来就要同时提到
  //   两个模式名（"engrave 只有一个方向，woodcut 是……"），拿它做全等只是自找麻烦。
  const sem = (s) => {
    const i = s.indexOf('export default {');
    return s.slice(i)
      .replace(/woodcut|engrave/g, 'MODE')
      .replace(/hatch-lab-eng|hatch-lab/g, 'LAB')
      .replace(/（[^）]*）/, '（…）');
  };
  assert.equal(sem(a), sem(b), '两份夹具的 style / timeline 除了模式名之外不该有任何差别');
});

t('文档点了名（不然这套东西没人知道存在）', () => {
  assert.ok(/woodcut|多方向排线/.test(read('docs/COOKBOOK.md')), 'COOKBOOK 里没提多方向排线');
});

/* ═══════ 汇总 ═══════ */

if (failed.length) {
  console.log('test-woodcut: ' + passed + ' 项通过，' + failed.length + ' 项失败');
  for (const f of failed) console.log(f);
  process.exit(1);
}
console.log('test-woodcut: ' + passed + ' 项通过');