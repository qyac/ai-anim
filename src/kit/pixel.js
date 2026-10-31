// @ts-check
/**
 * `src/kit/pixel.js` —— **像素精灵 / 调色板量化 / 5x7 像素字**（BACKLOG 1-67；
 * 素材包缺口表第 9 行，覆盖 7 条：K28 L49 L51 O77 R5 V13 X13）。
 *
 * 这一层解决的是「**画面被一台老机器算出来**」这件事，而不是「加个扫格线滤镜」。
 * 真像素艺术有四条硬约束，缺一条就只是「糊了」：
 *
 *   ① **调色板**：颜色只能从一张很小的表里挑（4 / 8 / 16 色）。颜色一多，块就不读了；
 *   ② **块**：所有边缘落在同一个栅格上（默认 8 逻辑像素），没有半个块；
 *   ③ **抖动**：两个调色板色之间用**有序抖动**（Bayer）过渡，不是渐变 —— 渐变一出就穿帮；
 *   ④ **帧率**：动作在 **8–12fps** 的台阶上跳，不是 60fps 平滑（平滑 = 现代，跳台阶 = 当年）。
 *
 * 四件事分别对应本文件的 `paletteOf` / `cellOf` / `ditherQuantize` / `snapTime`，
 * 另外给三件常用的成品：`pixelGradient`（带抖动的像素渐变）、
 * `drawSprite`（内建精灵）、`pixelText`（5x7 像素字）。
 *
 * ## 三条写错不报错、只出错画面的
 *
 * 1. **抖动必须按块坐标取阈值**，不是按像素 —— 传 `Math.round(x/cell)` 进去，
 *    否则同一块里的不同像素会取到不同阈值，块被撕成噪点（看着像"加了噪点"而不是"像游戏机"）。
 * 2. **像素字与精灵必须落在整块上**（`x = Math.round(x / cell) * cell`）。差半个块，
 *    抗锯齿会把边缘抹成一层灰 —— 在缩略图里看不出来，全屏看就是"脏"。
 * 3. **12fps 的台阶要由整片时间 `f.t` 算**（`snapTime(f.t)`），不是由 `f.lt` ——
 *    用段内时间的话，每一次切段都会把台阶重置到 0，动作会"卡一下"。
 *
 * 回归：`tools/test-pixel.mjs`（纯 JS，不需要 GPU）。
 */

import { clamp, sat } from '../core/util.js';

/** @typedef {[number, number, number]} RGB */

/* ══════════════════════════════════════════════════ ① 调色板 */

/**
 * 内建调色板（**sRGB 十六进制**，给人读的；`paletteOf()` 会同时算好线性值）。
 *
 * ⚠ 为什么存 sRGB 而不是线性：调色板是「这张表规定了画面有几种颜色」的**声明**，
 *   人对着 `#0f380f` 能读出这是 Game Boy 的墨绿；存线性值（0.0036, 0.0331, 0.0036）
 *   谁也读不出来。线性换算在 `paletteOf()` 里做一次。
 */
export const PIXEL_PALETTES = {
  /** 四阶绿（Game Boy DMG）。深 → 浅。 */
  gameboy: {
    label: '四阶绿',
    note: 'Game Boy 那张四阶绿：深墨绿 → 黄绿。只做单色画，最像"被算出来的"。',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
  /** 红白机那套（深蓝底 + 亮色）。 */
  nes: {
    label: '红白机',
    note: '深蓝底 + 六色：红/橙/黄/青/白。适合"游戏标题卡"。',
    colors: ['#0b1026', '#1d2b53', '#7e2553', '#ff004d', '#ffa300', '#ffec27', '#29adff', '#fff1e8'],
  },
  /** 琥珀单色终端。 */
  amber: {
    label: '琥珀屏',
    note: '琥珀单色 CRT：四个明度台阶，配深棕底。',
    colors: ['#1a1004', '#5a3208', '#b06c10', '#ffb000'],
  },
  /** 八色小机器（PICO-8 那种手感，颜色是自己挑的）。 */
  pico: {
    label: '八色',
    note: '八色小机器：深紫底 + 饱和的六色，最"彩色掌机"。',
    colors: ['#1a1228', '#2e2244', '#00796b', '#29adff', '#ffec27', '#ff8a3d', '#ff4d6d', '#fff1e8'],
  },
  /** 一比特：只有黑白（传真 / 老 Mac）。 */
  bit1: {
    label: '一比特',
    note: '只有黑白。抖动就是全部的明暗 —— 抖动密度一错，整张图就读不出来。',
    colors: ['#101014', '#e8e6df'],
  },
};

/** 调色板的默认名 */
export const DEFAULT_PALETTE = 'gameboy';

/**
 * @param {string} hex '#rgb' 或 '#rrggbb' → [r,g,b] 0..255
 * @returns {number[]}
 */
function hexToBytes(hex) {
  const h = String(hex).replace('#', '').trim();
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(v)) throw new Error('调色板颜色不是合法的十六进制：' + hex);
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * **取一张调色板**：名字（`'gameboy'`）或自定义色表（`['#000', '#fff']`）。
 *
 * 返回三个平行数组，因为三种用途要三种空间：
 *   · `hex`    —— 给人看的、写进文档的；
 *   · `srgb`   —— **量化决策在这里做**（人眼看到的亮度是显示空间的亮度，不是线性光）；
 *   · `linear` —— 画进 `lines` 用的（引擎全程线性光）。
 *
 * 名字写错**当场抛**并列出可用的（不许静默回落成第一张 —— 那样"我要的四阶绿"会变成
 * 别的调色板，而画面照样出）。
 *
 * @param {string | string[]} [spec] 调色板名，或自定义色表（2–32 色）
 * @returns {{ name: string, label: string, hex: string[], srgb: number[][], linear: number[][] }}
 */
export function paletteOf(spec = DEFAULT_PALETTE) {
  let name;
  let hexes;
  let label;
  let note;
  if (Array.isArray(spec)) {
    hexes = spec.map(String);
    name = 'custom';
    label = '自定义';
    note = '';
  } else {
    const key = String(spec);
    const pack = PIXEL_PALETTES[key];
    if (!pack) {
      throw new Error(
        '未知的像素调色板 "' + key + '"。可用的：' + Object.keys(PIXEL_PALETTES).join(' / ')
        + '（也可以直接给色表：["#000000", "#ffffff"]）',
      );
    }
    name = key;
    hexes = pack.colors.slice();
    label = pack.label;
    note = pack.note;
  }
  if (hexes.length < 2) throw new Error('像素调色板至少要 2 色（收到 ' + hexes.length + ' 个）');
  if (hexes.length > 32) throw new Error('像素调色板最多 32 色（收到 ' + hexes.length + ' 个）—— 颜色越多越不像像素画');
  const bytes = hexes.map(hexToBytes);
  return {
    name,
    label,
    hex: hexes,
    srgb: bytes.map((b) => b.map((v) => v / 255)),
    linear: bytes.map((b) => b.map((v) => srgbToLinear(v / 255))),
    /** 供文档/调试：这张表的说明 */
    note: note ?? '',
  };
}

/** sRGB 通道 → 线性光（与 `src/core/util.js` 同一口径，这里不 import 是为了让本文件零依赖可测） */
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 感知亮度（Rec.709 系数，作用于 sRGB 值）。 */
export function lumaOf(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/* ══════════════════════════════════════════════════ ② 量化与抖动 */

/**
 * 有序抖动矩阵（Bayer）。递归定义，所以 2/4/8 一定自洽 —— 手抄 8x8 那张表
 * 是这一层最容易抄错的地方（错一位，整片灰度会偏向一侧）。
 * @param {number} n 边长（2 的幂）
 * @returns {number[][]} 值域 0 .. n*n-1
 */
function bayerMatrix(n) {
  if (n <= 1) return [[0]];
  const half = bayerMatrix(n / 2);
  const h = n / 2;
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < h; x++) {
      const v = half[y][x] * 4;
      m[y][x] = v;
      m[y][x + h] = v + 2;
      m[y + h][x] = v + 3;
      m[y + h][x + h] = v + 1;
    }
  }
  return m;
}

/** 三种常用的抖动尺寸（`'none'` = 不抖，直接取最近色） */
export const DITHER_MODES = { none: 1, bayer2: 2, bayer4: 4, bayer8: 8 };

const BAYER_CACHE = new Map();
/**
 * 某个块坐标上的 Bayer 阈值，值域 (0, 1)。
 * @param {number} x 块坐标（**不是**像素坐标，见文件头第 1 条）
 * @param {number} y
 * @param {number} [size] 2 / 4 / 8
 */
export function bayerAt(x, y, size = 4) {
  const n = Math.max(1, Math.round(size));
  let m = BAYER_CACHE.get(n);
  if (!m) { m = bayerMatrix(n); BAYER_CACHE.set(n, m); }
  const ix = ((Math.floor(x) % n) + n) % n;
  const iy = ((Math.floor(y) % n) + n) % n;
  return (m[iy][ix] + 0.5) / (n * n);
}

/**
 * 找一个颜色在调色板里的**最近色下标**（在 sRGB 空间里比距离）。
 * @param {number[]} rgb sRGB 0..1
 * @param {number[][]} colors sRGB 0..1 的色表
 * @returns {number}
 */
export function nearestIndex(rgb, colors) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    const dr = rgb[0] - c[0];
    const dg = rgb[1] - c[1];
    const db = rgb[2] - c[2];
    // 加权距离：人眼对绿最敏感、蓝最不敏感（不加权时蓝色会抢走一整档）
    const d = 0.30 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * **不抖动**地量化：直接取最近色。
 * @param {number[]} rgb sRGB 0..1
 * @param {number[][]} colors sRGB 0..1
 * @returns {number[]} 调色板里的那个颜色（同一个数组引用）
 */
export function quantize(rgb, colors) {
  return colors[nearestIndex(rgb, colors)];
}

/**
 * **有序抖动**量化：在本色与次近色之间按 Bayer 阈值二选一。
 *
 * 为什么是"最近的两个色"而不是"先把亮度映射到色阶再抖"：
 * 调色板不一定是单调的明度阶梯（红白机那张有红橙黄加青白），按明度映射会把
 * 一个饱和的橙色变成一坨灰。取最近两色 = 在**色域里**最近，抖动出来的过渡才不脏。
 *
 * @param {number[]} rgb sRGB 0..1
 * @param {number[][]} colors sRGB 0..1
 * @param {number} bx **块**坐标
 * @param {number} by
 * @param {number} [size] Bayer 尺寸（1 = 不抖）
 * @returns {number[]} 调色板里的颜色
 */
export function ditherQuantize(rgb, colors, bx, by, size = 4) {
  if (!(size > 1)) return quantize(rgb, colors);
  let i0 = 0; let d0 = Infinity; let i1 = 0; let d1 = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    const dr = rgb[0] - c[0];
    const dg = rgb[1] - c[1];
    const db = rgb[2] - c[2];
    const d = 0.30 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
    if (d < d0) { d1 = d0; i1 = i0; d0 = d; i0 = i; }
    else if (d < d1) { d1 = d; i1 = i; }
  }
  if (!(d0 > 0)) return colors[i0];          // 正好落在某个色上（含全黑/全白）
  const sum = d0 + d1;
  if (!(sum > 0)) return colors[i0];
  // 越靠近次近色，被选中的概率越高（最大 50%：再高就变成"另一个色"了）
  const p = clamp(Math.sqrt(d0 / sum) * 0.5, 0, 0.5);
  return bayerAt(bx, by, size) < p ? colors[i1] : colors[i0];
}

/* ══════════════════════════════════════════════════ ③ 栅格工具 */

/**
 * 把坐标吸附到整块上（像素艺术的一切都落在这个栅格上）。
 * @param {number} v @param {number} cell
 */
export function snapTo(v, cell) {
  const s = Math.round(v / Math.max(1e-6, cell)) * cell;
  // `-0` 与 `0` 在 `Object.is` 下不等 —— 单测与快照都会被它绊一下，这里归一掉
  return s === 0 ? 0 : s;
}

/**
 * 12fps 的时间台阶：返回**已经吸附的秒数**。
 *
 * 用它，动作就会在 1/12 秒的格子上跳 —— 这是"当年那台机器算力不够"的唯一可见证据，
 * 也是像素动效与普通动效最本质的区别（平滑运镜一加，前面三件事全白做）。
 *
 * @param {number} t 秒
 * @param {number} [fps] 台阶频率（默认 12；8 更"卡"，15 接近掌机）
 */
export function snapTime(t, fps = 12) {
  const f = Math.max(1e-3, fps);
  return snapIndex(t, f) / f;
}

/** 时间台阶的**序号**（要按 "这一格" 取哈希/选帧时用它，比 `Math.floor(t*12)` 明确） */
export function snapIndex(t, fps = 12) {
  return Math.floor(t * Math.max(1e-3, fps) + 1e-6);
}

/* ══════════════════════════════════════════════════ ④ 精灵 */

/**
 * 内建精灵（`#` = 着墨，`.` = 空）。全部是自己画的 8 格以内的形状，
 * 没有任何来自商业作品的字模（这一层的清单来自素材包的能力描述，图案本身是原创）。
 */
export const SPRITES = {
  heart: ['##.##', '#####', '#####', '.###.', '..#..'],
  star: ['..#..', '..#..', '#####', '.###.', '.#.#.', '#...#'],
  coin: ['.####.', '##..##', '#.##.#', '#.##.#', '##..##', '.####.'],
  key: ['.###...', '#...#..', '#.###..', '#.#....', '.##....'],
  diamond: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
  bot: ['..####..', '.#....#.', '.#.##.#.', '.#....#.', '..####..', '.##..##.', '.#....#.', '..#..#..'],
  ghost: ['..####..', '.######.', '##.##.##', '########', '########', '#.##.##.', '#......#'],
  tree: ['...#...', '..###..', '.#####.', '#######', '.#####.', '...#...', '...#...', '...#...'],
  skull: ['.#####.', '#######', '#.###.#', '#######', '.#.#.#.', '.......'],
  arrow: ['...#...', '...##..', '#######', '...##..', '...#...'],
  block: ['####', '####', '####', '####'],
  dot: ['##', '##'],
  slash: ['.....#', '....#.', '...#..', '..#...', '.#....', '#.....'],
  cross: ['..#..', '..#..', '#####', '..#..', '..#..'],
};

/**
 * 取一个精灵。名字写错**当场抛**并列出可用的（"我要机器人，出来一棵树"是这类 API
 * 最典型的静默失败）。
 * @param {string | string[]} spec 精灵名，或直接给行数组
 * @returns {{ name: string, w: number, h: number, rows: string[] }}
 */
export function spriteOf(spec) {
  if (Array.isArray(spec)) {
    const rows = spec.map(String);
    const w = Math.max(...rows.map((r) => r.length));
    if (rows.length < 1 || w < 1) throw new Error('精灵至少要一行一列');
    return { name: 'custom', w, h: rows.length, rows };
  }
  const key = String(spec);
  const rows = SPRITES[key];
  if (!rows) {
    throw new Error('未知的像素精灵 "' + key + '"。可用的：' + Object.keys(SPRITES).join(' / '));
  }
  return { name: key, w: Math.max(...rows.map((r) => r.length)), h: rows.length, rows: rows.slice() };
}

/**
 * 精灵画在画布上的包围盒（**轴对齐**，与像素栅格对齐）。
 * @param {{ w: number, h: number }} sprite
 * @param {number} x @param {number} y 左上角（逻辑像素）
 * @param {number} [scale] 一个像素格占多少逻辑像素
 */
export function spriteRect(sprite, x, y, scale = 8) {
  return { x, y, w: sprite.w * scale, h: sprite.h * scale };
}

/**
 * 从一行字模里取出连续的着墨段（run-length）：一行 5 个连续的 `#` 只画**一条**线段。
 *
 * 为什么必须合并：一个 5x7 的字有 35 个格子，逐格画就是一帧 35 条线段；合并之后
 * 通常只剩 7–12 条。像素字一整屏几十个字，这个差别就是"能不能一帧画完"。
 *
 * @param {string} row
 * @returns {Array<[number, number]>} [起, 止) 的格坐标
 */
export function rowRuns(row) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= row.length; i++) {
    const on = row[i] === '#';
    if (on && start < 0) start = i;
    if (!on && start >= 0) { runs.push([start, i]); start = -1; }
  }
  return runs;
}

/**
 * 把一组 run 画成线段批（一条 run = 一条线段，线宽 = 一格）。
 *
 * ⚠ `lines.seg` 画的是**胶囊**：端点是圆的，会各多出半个线宽。所以一条 run 的
 *   两个端点要各向内缩半格 —— 不缩的话每个字的右边都会多出半格墨，
 *   一整行字读起来就是"糊"（出图放大才看得出来）。
 */
function pushRuns(lines, runs, x0, y, cell, color) {
  for (const [a, b] of runs) {
    const x1 = x0 + a * cell + cell * 0.5;
    const x2 = x0 + b * cell - cell * 0.5;
    lines.seg(x1, y + cell * 0.5, x2, y + cell * 0.5, cell, color);
  }
}

/**
 * 画一个精灵。
 * @param {any} lines LineBatch
 * @param {{ w: number, h: number, rows: string[] }} sprite
 * @param {number} x @param {number} y 左上角
 * @param {{ scale?: number, color?: number[], alpha?: number, snap?: boolean }} [o]
 * @returns {{ x: number, y: number, w: number, h: number }} 实际画的包围盒
 */
export function drawSprite(lines, sprite, x, y, o = {}) {
  const cell = Math.max(1, o.scale ?? 8);
  const color = o.color ?? [1, 1, 1];
  const col = o.alpha == null || o.alpha >= 1 ? color : [color[0], color[1], color[2], o.alpha];
  const ox = o.snap === false ? x : snapTo(x, cell);
  const oy = o.snap === false ? y : snapTo(y, cell);
  for (let r = 0; r < sprite.rows.length; r++) {
    const row = sprite.rows[r];
    if (!row.includes('#')) continue;
    pushRuns(lines, rowRuns(row), ox, oy + r * cell, cell, col);
  }
  return { x: ox, y: oy, w: sprite.w * cell, h: sprite.h * cell };
}

/* ══════════════════════════════════════════════════ ⑤ 5x7 像素字 */

/**
 * 5 宽 7 高的点阵字模。**一行一个字模**，行与行之间用 `/` 分隔。
 *
 * 为什么不下载点阵字体：这一层的输入是"一整块画面"，只有这份表能让「每个字形落在
 * 自己的 6x8 格子里」精确成立（真字体会被 hinting / 亚像素定位毁掉，放大到 4K 还会糊）。
 * 这也让 `pixelTextWidth()` 可以**算**出来（= 字数 × 6 × scale），布局不用量。
 *
 * ⚠ 中文字**不在**这张表里：一个汉字要 12x12 以上才读得出，5x7 的表根本装不下。
 *   中文标题请用引擎的 `type.write` + 后处理 `post.pixel`（本文件的 `pixel` 模板两种都示范了）。
 */
export const FONT5x7 = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.###.',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '#####/..#../..#../..#../..#../..#../#####',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#...#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  1: '..#../.##../..#../..#../..#../..#../.###.',
  2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '#####/...#./..#../...#./....#/#...#/.###.',
  4: '...#./..##./.#.#./#..#./#####/...#./...#.',
  5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '..##./.#.../#..../####./#...#/#...#/.###.',
  7: '#####/....#/...#./..#../.#.../.#.../.#...',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/...#./.##..',
  ' ': '...../...../...../...../...../...../.....',
  '.': '...../...../...../...../...../..#../..#..',
  ',': '...../...../...../...../..#../..#../.#...',
  ':': '...../..#../...../...../...../..#../.....',
  ';': '...../..#../...../...../...../..#../.#...',
  '-': '...../...../...../#####/...../...../.....',
  '+': '...../..#../..#../#####/..#../..#../.....',
  '_': '...../...../...../...../...../...../#####',
  '/': '....#/...#./...#./..#../.#.../.#.../#....',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  '%': '##..#/##.#./...#./..#../.#.../#.##./...##',
  '#': '.#.#./#####/.#.#./.#.#./#####/.#.#./.....',
  '*': '...../#.#.#/.###./#####/.###./#.#.#/.....',
  '=': '...../...../#####/...../#####/...../.....',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.',
  '>': '.#.../..#../...#./....#/...#./..#../.#...',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '[': '..###/..#../..#../..#../..#../..#../..###',
  ']': '###../..#../..#../..#../..#../..#../###..',
  '|': '..#../..#../..#../..#../..#../..#../..#..',
  "'": '..#../..#../...../...../...../...../.....',
  '"': '.#.#./.#.#./...../...../...../...../.....',
  '♥': '...../.#.#./#####/#####/.###./..#../.....',   // ♥
  '★': '..#../..#../#####/.###./.#.#./#...#/.....',   // ★
  '▲': '..#../..#../.#.#./.#.#./#...#/#...#/#####',   // ▲
  '▼': '#####/#...#/#...#/.#.#./.#.#./..#../..#..',   // ▼
  '▶': '#..../##.../###../####./###../##.../#....',   // ▶
  '→': '...../..#../...#./#####/...#./..#../.....',   // →
  '←': '...../..#../.#.../#####/.#.../..#../.....',   // ←
  '•': '...../...../.###./.###./.###./...../.....',   // •
};

/** 字模的列数 / 行数（布局常量，别在各处再写 5 和 7） */
export const GLYPH_W = 5;
export const GLYPH_H = 7;
/** 默认字距（格）—— 5 + 1 = 每字 6 格前进 */
export const GLYPH_TRACKING = 1;

/**
 * 取一个字的 7 行字模；表里没有的字返回**全空**（不是抛错：一段文字里混一个
 * 中文/emoji 就整行不画是最坏的结果，缺字留白至少还读得出别的字）。
 * @param {string} ch
 * @returns {string[]}
 */
export function glyphOf(ch) {
  const raw = FONT5x7[ch] ?? FONT5x7[ch.toUpperCase()];
  if (!raw) return ['.....', '.....', '.....', '.....', '.....', '.....', '.....'];
  const rows = raw.split('/');
  // 容错：行数/列数不对就补齐（表是手写的，补一次比抛错好 —— 但单测会钉住表本身是对的）
  while (rows.length < GLYPH_H) rows.push('.....');
  return rows.slice(0, GLYPH_H).map((r) => (r + '.....').slice(0, GLYPH_W));
}

/**
 * 一行像素字的宽度（逻辑像素）。
 * @param {string} text
 * @param {{ scale?: number, tracking?: number }} [o]
 */
export function pixelTextWidth(text, o = {}) {
  const scale = Math.max(1, o.scale ?? 8);
  const track = o.tracking ?? GLYPH_TRACKING;
  const n = String(text).length;
  return Math.max(0, (n * (GLYPH_W + track) - track) * scale);
}

/**
 * **写一行 5x7 像素字**。
 *
 * @param {any} lines LineBatch
 * @param {string} text
 * @param {number} x @param {number} y 左上角（逻辑像素）
 * @param {{
 *   scale?: number, tracking?: number, color?: number[], alpha?: number,
 *   align?: 'left'|'center'|'right',
 *   reveal?: number,     // 0..1：逐字揭晓（按字数取整 —— 台阶感来自这里，不要用连续 alpha）
 *   snap?: boolean,
 * }} [o]
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function pixelText(lines, text, x, y, o = {}) {
  const scale = Math.max(1, o.scale ?? 8);
  const track = o.tracking ?? GLYPH_TRACKING;
  const color = o.color ?? [1, 1, 1];
  const col = o.alpha == null || o.alpha >= 1 ? color : [color[0], color[1], color[2], o.alpha];
  const str = String(text ?? '');
  const w = pixelTextWidth(str, { scale, tracking: track });
  const h = GLYPH_H * scale;
  let ox = o.snap === false ? x : snapTo(x, scale);
  if (o.align === 'center') ox = snapTo(x - w / 2, scale);
  else if (o.align === 'right') ox = snapTo(x - w, scale);
  const oy = o.snap === false ? y : snapTo(y, scale);
  const reveal = o.reveal == null ? 1 : clamp(o.reveal, 0, 1);
  const shown = Math.floor(reveal * str.length + 1e-6);
  for (let i = 0; i < shown; i++) {
    const rows = glyphOf(str[i]);
    const cx = ox + i * (GLYPH_W + track) * scale;
    for (let r = 0; r < GLYPH_H; r++) {
      const row = rows[r];
      if (!row.includes('#')) continue;
      pushRuns(lines, rowRuns(row), cx, oy + r * scale, scale, col);
    }
  }
  return { x: ox, y: oy, w, h };
}

/* ══════════════════════════════════════════════════ ⑥ 像素渐变（抖动的天空） */

/**
 * **一块带抖动的像素渐变** —— 像素画里"天空/暮色/屏幕辉光"的标准做法。
 *
 * 相邻两档之间不是插值，是**有序抖动**：一半格子这一色、一半格子下一色。
 * 这也是本文件唯一会自动处理"多少个块"的函数（其余都要求调用方自己算栅格）。
 *
 * @param {any} lines LineBatch
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {{ srgb: number[][], linear: number[][] }} pal `paletteOf()` 的返回
 * @param {{
 *   cell?: number, dir?: 'v'|'h',
 *   from?: number, to?: number,   // **调色板下标**（0 = 最深、n-1 = 最亮），不是 0..1 的强度
 *   dither?: number,     // Bayer 尺寸（0/1 = 不抖）
 *   ramp?: (u: number) => number,   // 自定义强度曲线（u = 0..1 沿 dir）
 * }} [o]
 * @returns {number} 画了多少条线段（单测用来判"真的画了东西"）
 */
export function pixelGradient(lines, rect, pal, o = {}) {
  const cell = Math.max(2, Math.round(o.cell ?? 8));
  const dir = o.dir === 'h' ? 'h' : 'v';
  const size = Math.max(1, Math.round(o.dither ?? 4));
  const last = pal.srgb.length - 1;
  // ⚠ from / to 是**调色板下标**，不是 0..1 的强度：像素渐变的语义就是
  //   "从第几档颜色走到第几档颜色"（四阶绿就是 0→3），中间用抖动补齐。
  //   早先写成强度（0..1）时 from=to=1 会落在**最后一档**，看上去"全是亮的"，
  //   而调用方以为自己写的是"最暗"。
  const a0 = clamp(Math.round(o.from ?? 0), 0, last);
  const a1 = clamp(Math.round(o.to ?? last), 0, last);
  const nx = Math.max(1, Math.round(rect.w / cell));
  const ny = Math.max(1, Math.round(rect.h / cell));
  const x0 = snapTo(rect.x, cell);
  const y0 = snapTo(rect.y, cell);
  let n = 0;
  // 逐行扫，把**同色的连续格**并成一条线段（一条地平线色带通常只有 1–2 段）
  for (let j = 0; j < ny; j++) {
    let runStart = -1;
    let runColor = null;
    for (let i = 0; i <= nx; i++) {
      let c = null;
      if (i < nx) {
        const u = dir === 'h' ? i / Math.max(1, nx - 1) : j / Math.max(1, ny - 1);
        const k = o.ramp ? sat(o.ramp(u)) : u;
        // 在调色板的**色阶**上取一个位置（a0..a1 是下标区间的两端，允许反向）
        const idx = clamp(a0 + (a1 - a0) * k, 0, last);
        const i0 = Math.floor(idx);
        const i1 = Math.min(last, i0 + 1);
        const frac = idx - i0;
        const pa = pal.srgb[i0];
        const pb = pal.srgb[i1];
        const target = [pa[0] + (pb[0] - pa[0]) * frac, pa[1] + (pb[1] - pa[1]) * frac, pa[2] + (pb[2] - pa[2]) * frac];
        c = ditherQuantize(target, pal.srgb, i, j, size);
      }
      const same = c && runColor && c === runColor;
      if (!same) {
        if (runStart >= 0) {
          const k = pal.srgb.indexOf(runColor);
          lines.seg(x0 + runStart * cell + cell * 0.5, y0 + j * cell + cell * 0.5,
            x0 + i * cell - cell * 0.5, y0 + j * cell + cell * 0.5, cell, pal.linear[k] ?? runColor);
          n++;
        }
        runStart = c ? i : -1;
        runColor = c;
      }
    }
  }
  return n;
}
