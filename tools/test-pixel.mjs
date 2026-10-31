#!/usr/bin/env node
// @ts-check
/**
 * **像素精灵 / 调色板量化 / 5x7 像素字**（`src/kit/pixel.js`）—— 离线单测。
 * 不需要 GPU / 浏览器 / Vite：
 *
 *   node tools/test-pixel.mjs
 *
 * 钉的是 BACKLOG **1-67**（素材包缺口表第 9 行，覆盖 7 条 K28 L49 L51 O77 R5 V13 X13）。
 * 这一层有四件事**写错都不报错、只出错画面**，所以每一条都变成断言：
 *
 *   ① **抖动要按块坐标取阈值**：按像素取 ⇒ 同一块被撕成噪点（看着像"加了噪点"而不是"像游戏机"）；
 *   ② **量化取的是最近两色**：写成"按亮度找色阶" ⇒ 饱和的橙被摊成灰；
 *   ③ **像素字的线段端点要内缩半格**：胶囊端点是圆的，不缩每个字右边多出半格墨 ⇒ 整行发糊；
 *   ④ **时间台阶要由整片时间算**：用段内时间 ⇒ 每次切段动作卡一下。
 *
 * 另外钉三件结构性的：字模表**每格都恰好 7 行 x 5 列**（手写表最容易错在这里，
 * 而错一位的表现是"某个字少一笔"，出图很难发现）、字模表**必须覆盖 ASCII 的可打印字符**
 * 的子集、以及 `kit/index.js` / `regress-all` / AGENTS 三处接线都在。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PIXEL_PALETTES, DEFAULT_PALETTE, paletteOf, lumaOf,
  DITHER_MODES, bayerAt, nearestIndex, quantize, ditherQuantize,
  snapTo, snapTime, snapIndex,
  SPRITES, spriteOf, spriteRect, rowRuns, drawSprite,
  FONT5x7, glyphOf, GLYPH_W, GLYPH_H, GLYPH_TRACKING, pixelTextWidth, pixelText,
  pixelGradient,
} from '../src/kit/pixel.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
const failed = [];
function t(name, fn) {
  try { fn(); passed++; }
  catch (err) {
    failed.push('  x ' + name + '\n      '
      + String(err && err.message ? err.message : err).split('\n').join('\n      '));
  }
}

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

/** 记下每一条 seg 的假 LineBatch（start 用**格坐标**表示，单测不比坐标本身）。 */
function fakeLines() {
  const segs = [];
  return {
    segs,
    seg(x0, y0, x1, y1, w, c) { segs.push({ x0, y0, x1, y1, w, c }); },
    clear() { segs.length = 0; },
  };
}

/* ═══════ 1. 调色板 ═══════ */

t('五张内建调色板都在，且每张至少 2 色', () => {
  const names = Object.keys(PIXEL_PALETTES);
  assert.deepEqual(names.sort(), ['amber', 'bit1', 'gameboy', 'nes', 'pico'].sort());
  for (const [k, p] of Object.entries(PIXEL_PALETTES)) {
    assert.ok(p.colors.length >= 2, k + ' 只有 ' + p.colors.length + ' 色');
    assert.ok(typeof p.label === 'string' && p.label.length > 0, k + ' 缺 label');
    assert.ok(typeof p.note === 'string' && p.note.length > 8, k + ' 缺说明 (note)');
  }
});

t('paletteOf 给出三套平行数组：hex / srgb(0..1) / linear', () => {
  const pal = paletteOf('gameboy');
  assert.equal(pal.name, 'gameboy');
  assert.equal(pal.hex.length, 4);
  assert.equal(pal.srgb.length, 4);
  assert.equal(pal.linear.length, 4);
  assert.equal(pal.hex[0], '#0f380f');
  assert.ok(near(pal.srgb[0][0], 0x0f / 255, 1e-12));
  // 线性值必须 <= sRGB 值（除非 0 或 1）：sRGB 是 gamma 编码，线性光更暗
  for (let i = 0; i < 4; i++) {
    for (let c = 0; c < 3; c++) {
      const s = pal.srgb[i][c];
      if (s > 1e-6 && s < 1 - 1e-6) assert.ok(pal.linear[i][c] < s, '线性值不该 >= sRGB 值');
    }
  }
});

t('paletteOf 默认取 DEFAULT_PALETTE，且默认那张真的存在', () => {
  assert.ok(PIXEL_PALETTES[DEFAULT_PALETTE], 'DEFAULT_PALETTE 指向一张不存在的调色板');
  assert.equal(paletteOf().name, DEFAULT_PALETTE);
});

t('调色板名写错**当场抛**，并列出可用的（不许静默回落）', () => {
  assert.throws(() => paletteOf('gameboyy'), (e) => {
    assert.ok(/gameboyy/.test(e.message), '报错里要带上写错的名字');
    assert.ok(/gameboy/.test(e.message) && /amber/.test(e.message), '报错里要列出可用的');
    return true;
  });
});

t('自定义色表也接受；少于 2 色 / 多于 32 色直接抛', () => {
  const pal = paletteOf(['#000000', '#ffffff', '#ff0000']);
  assert.equal(pal.name, 'custom');
  assert.equal(pal.srgb.length, 3);
  assert.throws(() => paletteOf(['#000000']), /至少/);
  assert.throws(() => paletteOf(new Array(40).fill('#000000').map((_, i) => '#' + (i * 1000).toString(16).padStart(6, '0').slice(0, 6))), /最多/);
});

t('非法十六进制直接抛（而不是悄悄变成黑色）', () => {
  assert.throws(() => paletteOf(['#zzzzzz', '#ffffff']), /十六进制/);
});

t('三字符缩写 #abc 与六字符 #aabbcc 等价', () => {
  assert.deepEqual(paletteOf(['#abc', '#fff']).srgb[0], paletteOf(['#aabbcc', '#ffffff']).srgb[0]);
});

t('lumaOf 用的是 Rec.709 权重（纯绿比纯蓝亮得多）', () => {
  assert.ok(lumaOf([0, 1, 0]) > lumaOf([0, 0, 1]) * 5);
  assert.ok(near(lumaOf([1, 1, 1]), 1, 1e-12));
});

/* ═══════ 2. 抖动（这一层最容易踩的坑） ═══════ */

t('Bayer 矩阵是递归的：4x4 恰好包含 0..15 各一次', () => {
  const seen = new Set();
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = Math.round(bayerAt(x, y, 4) * 16 - 0.5);
    assert.ok(v >= 0 && v < 16, 'bayerAt 越界：' + v);
    seen.add(v);
  }
  assert.equal(seen.size, 16, '4x4 的 16 个阈值必须互不相同（否则灰度会偏向一侧）');
});

t('bayerAt 按**块**坐标取：同一块内所有像素取到同一个阈值', () => {
  // 调用方传的是块坐标；传同一个块坐标必须得到同一个值（这就是为什么不能传像素坐标）
  assert.equal(bayerAt(3, 5, 4), bayerAt(3, 5, 4));
  // 周期：块坐标 +4 与 +0 相同
  assert.ok(near(bayerAt(3, 5, 4), bayerAt(7, 9, 4), 1e-12));
});

t('bayerAt 值域严格在 (0,1) 内，且负数坐标也能取（画面可以画到屏幕外）', () => {
  for (let i = -20; i < 20; i++) {
    const v = bayerAt(i, i * 3, 8);
    assert.ok(v > 0 && v < 1, 'bayerAt(' + i + ') = ' + v + ' 越界');
  }
});

t('DITHER_MODES 的四档与 Bayer 尺寸一致', () => {
  assert.deepEqual(DITHER_MODES, { none: 1, bayer2: 2, bayer4: 4, bayer8: 8 });
});

t('nearestIndex 在 sRGB 空间取最近色（不是按亮度）', () => {
  const pal = paletteOf(['#000000', '#ff0000', '#00ff00', '#0000ff']);
  assert.equal(nearestIndex([0.9, 0.05, 0.05], pal.srgb), 1, '偏红该选红');
  assert.equal(nearestIndex([0.05, 0.05, 0.9], pal.srgb), 3, '偏蓝该选蓝');
  assert.equal(nearestIndex([0.02, 0.02, 0.02], pal.srgb), 0, '近黑该选黑');
});

t('quantize 返回调色板里的**那个数组引用**（不是新对象）', () => {
  const pal = paletteOf('gameboy');
  assert.equal(quantize([0.5, 0.5, 0.5], pal.srgb), pal.srgb[nearestIndex([0.5, 0.5, 0.5], pal.srgb)]);
});

t('ditherQuantize 只在最近两色之间选（不会跳到第三种颜色）', () => {
  const pal = paletteOf(['#000000', '#808080', '#ffffff']);
  const seen = new Set();
  // 0.75 正好落在"中灰"与"白"之间 —— 这里必须抖出那两色，不能跳到黑
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    seen.add(pal.srgb.indexOf(ditherQuantize([0.75, 0.75, 0.75], pal.srgb, x, y, 4)));
  }
  assert.ok(seen.size >= 2, '中灰与白之间必须抖出两种颜色（否则就是没抖）');
  assert.ok(seen.size <= 2, '抖出了 ' + seen.size + ' 种颜色 —— 只能取最近的两色');
});

t('ditherQuantize 的覆盖率随距离**单调**变化（这是"抖动是渐变"的全部理由）', () => {
  // 在 0 与 1 之间取几个位置：越靠近亮色，亮色的格子占比越高
  const pal = paletteOf(['#000000', '#ffffff']);
  const cover = (v) => {
    let n = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (pal.srgb.indexOf(ditherQuantize([v, v, v], pal.srgb, x, y, 16)) === 1) n++;
    }
    return n;
  };
  const c = [0.25, 0.4, 0.5, 0.6, 0.75].map(cover);
  for (let i = 1; i < c.length; i++) {
    assert.ok(c[i] >= c[i - 1], '覆盖率不单调：' + c.join(' / '));
  }
  assert.ok(c[3] > c[1], '0.6 的亮点必须明显多于 0.4（抖动真的在表达明暗）');
});

t('ditherQuantize 落在色上时原样返回（全黑/全白不许抖出花）', () => {
  const pal = paletteOf(['#000000', '#ffffff']);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
    assert.equal(pal.srgb.indexOf(ditherQuantize([0, 0, 0], pal.srgb, x, y, 4)), 0, '全黑被抖出了白点');
    assert.equal(pal.srgb.indexOf(ditherQuantize([1, 1, 1], pal.srgb, x, y, 4)), 1, '全白被抖出了黑点');
  }
});

t('dither: 1（或 0）等于不抖，与 quantize 逐点一致', () => {
  const pal = paletteOf('nes');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = [x / 8, y / 8, 0.3];
    assert.equal(ditherQuantize(v, pal.srgb, x, y, 1), quantize(v, pal.srgb));
  }
});

/* ═══════ 3. 栅格与时间台阶 ═══════ */

t('snapTo 把坐标吸到整块（-0 也归 0）', () => {
  assert.equal(snapTo(13, 8), 16);
  assert.equal(snapTo(11, 8), 8);
  assert.equal(snapTo(-4, 8), 0);
  assert.ok(Object.is(snapTo(-4, 8), 0), 'snapTo 不该返回 -0');
});

t('snapTime 是**台阶**：1/12 秒内所有时刻取到同一个值', () => {
  const base = snapTime(1.0);
  for (let k = 0; k < 80; k++) {
    const t = 1.0 + k / 1000;   // 1/12 秒 = 83.3ms，80ms 之内都还在同一格
    assert.equal(snapTime(t), base, '同一台阶内的 ' + t.toFixed(4) + ' 跳了');
  }
  assert.notEqual(snapTime(1 + 1 / 12), base, '下一台阶必须换值');
});

t('snapTime 单调不减，且台阶宽度 = 1/fps', () => {
  let prev = -1;
  for (let i = 0; i < 200; i++) {
    const v = snapTime(i / 60, 12);
    assert.ok(v >= prev, 'snapTime 不单调');
    prev = v;
  }
  const seeds = new Set();
  for (let i = 0; i < 120; i++) seeds.add(snapTime(i / 60, 12));
  assert.equal(seeds.size, 24, '2 秒 @60fps 应该只有 24 个台阶，实际 ' + seeds.size);
});

t('snapIndex 是台阶序号（按它取哈希 = 每一格换一次，不是每一帧）', () => {
  assert.equal(snapIndex(0), 0);
  assert.equal(snapIndex(1 / 12), 1);
  assert.equal(snapIndex(1 / 12 - 1e-3), 0, '台阶边界之前必须还留在上一格');
  assert.equal(snapIndex(1 / 60), 0, '60fps 的第一帧仍在第 0 格');
  assert.equal(snapTime(5.0, 8), snapIndex(5.0, 8) / 8, 'snapTime 与 snapIndex 必须同源');
});

/* ═══════ 4. 精灵 ═══════ */

t('内建精灵表每个都至少 1 行 1 列，且只含 # 与 .', () => {
  const names = Object.keys(SPRITES);
  assert.ok(names.length >= 10, '精灵太少：' + names.length);
  for (const n of names) {
    const rows = SPRITES[n];
    assert.ok(rows.length >= 1, n + ' 没有行');
    for (const r of rows) {
      assert.ok(/^[#.]+$/.test(r), n + ' 的行里出现了 # . 以外的字符：' + r);
    }
  }
});

t('spriteOf 名字写错**当场抛**并列出可用的', () => {
  assert.throws(() => spriteOf('herat'), (e) => {
    assert.ok(/herat/.test(e.message));
    assert.ok(/heart/.test(e.message));
    return true;
  });
});

t('spriteOf 能算宽高，宽取最长那行（行可以不等长）', () => {
  const s = spriteOf('key');
  assert.equal(s.w, 7);
  assert.equal(s.h, 5);
  const custom = spriteOf(['#', '###']);
  assert.equal(custom.w, 3);
  assert.equal(custom.h, 2);
});

t('rowRuns 把连续着墨合并成段（这是"5x7 的字只画几条线"的全部理由）', () => {
  assert.deepEqual(rowRuns('#####'), [[0, 5]]);
  assert.deepEqual(rowRuns('#.###'), [[0, 1], [2, 5]]);
  assert.deepEqual(rowRuns('.....'), []);
  assert.deepEqual(rowRuns('##..##'), [[0, 2], [4, 6]]);
});

t('drawSprite 的线段端点**内缩半格**（胶囊端点是圆的，不缩每个字右边多出半格墨）', () => {
  const L = fakeLines();
  drawSprite(L, spriteOf(['###']), 0, 0, { scale: 10 });
  assert.equal(L.segs.length, 1, '一行连续的 3 格应该只有 1 条线段');
  const s = L.segs[0];
  assert.ok(near(s.x0, 5, 1e-9), '左端该从 0.5 格开始，实际 ' + s.x0);
  assert.ok(near(s.x1, 25, 1e-9), '右端该到 2.5 格，实际 ' + s.x1);
  assert.ok(near(s.w, 10, 1e-9), '线宽必须正好一格');
});

t('drawSprite 默认对准栅格（snap: false 才允许画出整块之外）', () => {
  const a = fakeLines();
  drawSprite(a, spriteOf(['##']), 13, 21, { scale: 8 });
  assert.equal(a.segs[0].y0 % 8, 4, 'y 必须先吸到整块（块中心 = 整块 + 半格）');
  assert.ok(near(a.segs[0].x0, 16 + 4, 1e-9), 'x 没吸到 16：实际 ' + a.segs[0].x0);
  const b = fakeLines();
  drawSprite(b, spriteOf(['##']), 13, 21, { scale: 8, snap: false });
  assert.ok(near(b.segs[0].x0, 13 + 4, 1e-9), 'snap:false 时不该动坐标');
});

t('drawSprite 返回实际包围盒，且空格子不画线', () => {
  const L = fakeLines();
  const box = drawSprite(L, spriteOf(['#.#', '...']), 0, 0, { scale: 4 });
  assert.deepEqual(box, { x: 0, y: 0, w: 12, h: 8 });
  assert.equal(L.segs.length, 2, '两个孤立点各一条线段，空行不画');
});

t('spriteRect 算的是标称包围盒（与栅格对齐无关）', () => {
  assert.deepEqual(spriteRect({ w: 5, h: 3 }, 10, 20, 8), { x: 10, y: 20, w: 40, h: 24 });
});

/* ═══════ 5. 5x7 字模表（手写表最容易错的地方） ═══════ */

t('字模表每一项都恰好 7 行，每行 5 列（错一位 = 某个字少一笔，出图很难发现）', () => {
  const bad = [];
  for (const [ch, raw] of Object.entries(FONT5x7)) {
    const rows = raw.split('/');
    if (rows.length !== GLYPH_H) { bad.push(ch + ' 有 ' + rows.length + ' 行'); continue; }
    for (const r of rows) {
      if (r.length !== GLYPH_W) { bad.push(ch + ' 的行宽度 ' + r.length + '：' + r); break; }
      if (!/^[#.]+$/.test(r)) { bad.push(ch + ' 行里有非法字符：' + r); break; }
    }
  }
  assert.deepEqual(bad, [], '字模表有问题：\n' + bad.join('\n'));
});

t('字模表覆盖了 A-Z / 0-9 与常用标点（缺字会变成空白，得能数出来）', () => {
  const need = ['A', 'Z', '0', '9', ' ', '.', ',', ':', '-', '+', '/', '?', '!', '%', '=', '<', '>', '(', ')', '[', ']', '|', '#', '*'];
  const missing = need.filter((c) => !FONT5x7[c]);
  assert.deepEqual(missing, []);
});

t('glyphOf 大小写都认；表里没有的字返回全空（不是抛错 —— 一个中文不该毁掉整行）', () => {
  assert.deepEqual(glyphOf('a'), glyphOf('A'));
  const empty = glyphOf('中');
  assert.equal(empty.length, GLYPH_H);
  assert.ok(empty.every((r) => r === '.....'));
});

t('rowRuns 在字模上真的省了线：一个 Z 的线段数远小于墨点数', () => {
  const rows = glyphOf('Z');
  let ink = 0;
  let runs = 0;
  for (const r of rows) { ink += (r.match(/#/g) || []).length; runs += rowRuns(r).length; }
  assert.ok(ink >= 15, 'Z 的墨点太少：' + ink);
  assert.ok(runs < ink / 2, 'runs ' + runs + ' vs ink ' + ink + ' —— 合并没生效');
});

t('pixelTextWidth 与字模推进一致：n 个字 = n*(5+1)-1 格', () => {
  assert.equal(pixelTextWidth('A', { scale: 10 }), GLYPH_W * 10);
  assert.equal(pixelTextWidth('AB', { scale: 10 }), (2 * (GLYPH_W + GLYPH_TRACKING) - GLYPH_TRACKING) * 10);
  assert.equal(pixelTextWidth('', { scale: 10 }), 0);
});

t('pixelText 落点对准栅格；align 是**整行**对齐（不是逐字）', () => {
  const L = fakeLines();
  const box = pixelText(L, 'AB', 100, 50, { scale: 8, align: 'left' });
  assert.equal(box.x % 8, 0);
  const c = pixelText(fakeLines(), 'AB', 960, 50, { scale: 8, align: 'center' });
  assert.ok(Math.abs((c.x + c.w / 2) - 960) <= 8, '居中偏差 ' + Math.abs((c.x + c.w / 2) - 960) + 'px');
  const r = pixelText(fakeLines(), 'AB', 960, 50, { scale: 8, align: 'right' });
  assert.ok(Math.abs((r.x + r.w) - 960) <= 8, '右对齐偏差 ' + Math.abs((r.x + r.w) - 960) + 'px');
});

t('pixelText 的 reveal 是**逐字台阶**（不是连续 alpha）：0 一笔不画、1 全画', () => {
  const L0 = fakeLines();
  pixelText(L0, 'AB', 0, 0, { scale: 8, reveal: 0 });
  assert.equal(L0.segs.length, 0, 'reveal 0 不该画任何东西');
  const L1 = fakeLines();
  pixelText(L1, 'AB', 0, 0, { scale: 8, reveal: 1 });
  assert.ok(L1.segs.length > 10, 'reveal 1 应该画出两个字母');
  const none = fakeLines();
  pixelText(none, 'AB', 0, 0, { scale: 8, reveal: 0.25 });
  assert.equal(none.segs.length, 0, 'reveal 0.25 时一个字都还没揭晓');
  const one = fakeLines();
  pixelText(one, 'AB', 0, 0, { scale: 8, reveal: 0.5 });
  assert.ok(one.segs.length > 0 && one.segs.length < L1.segs.length, 'reveal 0.5（两个字里的第一个）应该只画出一个字母');
  const onlyA = fakeLines();
  pixelText(onlyA, 'A', 0, 0, { scale: 8, reveal: 1 });
  assert.equal(one.segs.length, onlyA.segs.length, 'reveal 0.5 时应该恰好只有 A 的那些线段');
});

t('pixelText 的每个字都落在自己的 6 格周期里（字距是空的，不是笔画撞在一起）', () => {
  const L = fakeLines();
  pixelText(L, 'II', 0, 0, { scale: 10 });
  const xs = new Set(L.segs.map((s) => Math.round(s.x0)));
  // 第一个字的左边界 5（半格）、第二个字 = 6 格 + 5
  assert.ok(xs.has(5) && xs.has(65), '两个字段的起点不对：' + [...xs].join(','));
});

/* ═══════ 6. 像素渐变 ═══════ */

t('pixelGradient 真的画了东西，且把同色格并成线段（省线段数）', () => {
  const pal = paletteOf('bit1');
  const L = fakeLines();
  const n = pixelGradient(L, { x: 0, y: 0, w: 160, h: 80 }, pal, { cell: 8, dither: 1 });
  assert.ok(n > 0, '一条线都没画');
  assert.equal(L.segs.length, n);
  // 不抖时每行最多两色 ⇒ 每行最多两条线；10 行 ⇒ 至多 20 条（而格子有 200 个）
  assert.ok(n <= 20, '线段数 ' + n + ' 太多 —— 同色格没有合并');
});

t('pixelGradient 的 from/to 决定明暗走向（to=1 时下半部分是亮的）', () => {
  const pal = paletteOf('bit1');
  const bright = (from, to) => {
    const L = fakeLines();
    pixelGradient(L, { x: 0, y: 0, w: 80, h: 160 }, pal, { cell: 8, dither: 1, from, to });
    return L.segs.reduce((a, s) => a + (s.c[0] > 0.4 ? 1 : 0), 0);
  };
  assert.ok(bright(0, 1) > 5, 'from 0 to 1 应该有亮色带');
  assert.ok(bright(1, 1) > bright(0, 1), 'from=to=1 应该全是亮色');
});

t('pixelGradient 的抖动档 1 = 不抖（同列同色），4 = 抖（同列出现两色）', () => {
  const pal = paletteOf('bit1');
  // ramp 恒定 0.5 ⇒ 目标色正好落在两档之间：不抖只能二选一，抖则一行里两种颜色都有
  const mixInRow = (dither) => {
    const L = fakeLines();
    pixelGradient(L, { x: 0, y: 0, w: 160, h: 160 }, pal, { cell: 8, dither, from: 0, to: 1, ramp: () => 0.5 });
    return L.segs.length;
  };
  assert.equal(mixInRow(1), 20, '不抖时每行恰好一条线段（10 行）');
  assert.ok(mixInRow(4) > mixInRow(1), '开了抖动反而更整齐？dither4=' + mixInRow(4) + ' dither1=' + mixInRow(1));
});

t('pixelGradient 的 from / to 是**调色板下标**（from=to=0 全是最深那档）', () => {
  const pal = paletteOf('bit1');
  const L = fakeLines();
  pixelGradient(L, { x: 0, y: 0, w: 80, h: 80 }, pal, { cell: 8, dither: 1, from: 0, to: 0 });
  assert.ok(L.segs.every((s) => s.c[0] < 0.1), 'from=to=0 时出现了亮色（下标语义被当成强度了）');
  const L2 = fakeLines();
  pixelGradient(L2, { x: 0, y: 0, w: 80, h: 80 }, pal, { cell: 8, dither: 1, from: 1, to: 1 });
  assert.ok(L2.segs.every((s) => s.c[0] > 0.5), 'from=to=1 应该是全亮（最后一档）');
});

/* ═══════ 7. 接线自检 ═══════ */

t('kit/index.js 转发了像素层的公开件', () => {
  const idx = read('src/kit/index.js');
  for (const fn of ['paletteOf', 'pixelText', 'drawSprite', 'spriteOf', 'snapTime', 'pixelGradient', 'ditherQuantize']) {
    assert.ok(idx.includes(fn), 'kit/index.js 没导出 ' + fn);
  }
});

t('regress-all 挂上了这条回归（加测试只改清单，不要改 verify.yml）', () => {
  assert.ok(read('tools/regress-all.mjs').includes('test-pixel.mjs'), 'regress-all.mjs 里没有 test-pixel');
});

t('AGENTS.md 点了名（不然这套东西没人知道存在）', () => {
  assert.ok(/pixelText|像素精灵|像素字/.test(read('AGENTS.md')), 'AGENTS.md 里没提像素层');
});

/* ═══════ 汇总 ═══════ */

if (failed.length) {
  console.log('test-pixel: ' + passed + ' 项通过，' + failed.length + ' 项失败');
  for (const f of failed) console.log(f);
  process.exit(1);
}
console.log('test-pixel: ' + passed + ' 项通过');
