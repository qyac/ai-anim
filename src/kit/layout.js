// @ts-check
/**
 * 排版工具：反复要写、与具体片子无关的那几个。
 *
 * 这个文件**不碰 GPU**（只操作 TextKit 这个已经在手上的对象），可以单独测。
 * 画在 `lines` 上的版面元件（panel / kicker / reticle / marker…）在 `elements.js`。
 *
 * 颜色约定：Canvas2D 的文字一律 `css(P.xxx)`（线性 → sRGB 字符串）；
 * `lines` 的矢量一律 `P.xxx`（线性，可 > 1 用来发光）。
 */

import { rng, css as cssOf, clamp } from '../core/util.js';

/** 颜色乘系数（lines 的线性亮度可以 > 1，用来发光）。 */
export function mul(c, k) {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** 给颜色加 alpha：`lines` 的颜色支持第 4 个分量，混合是 premultiplied 的（真半透明叠加）。 */
export function withAlpha(c, a) {
  return [c[0], c[1], c[2], a];
}

/** 夹到 0..1（`sat` 的别名，方便场景里少 import 一个名字）。 */
export function sat01(x) {
  return clamp(x, 0, 1);
}

/**
 * 按锚点写一行字。
 *
 * ⚠ 这是为了绕开一个真实的坑：`type.write` 是**逐字素簇** `fillText`，`textAlign`
 * 对每个字都生效，所以 `align: 'center'` 会让每个字各自居中、整行跑偏。
 * 引擎现在有 `type.writeLine(text, x, y, { anchor })` 做同一件事，这里是一层转发
 * （保留 `put` 这个名字，已经写了它的任务代码不用改）。
 *
 * @param {any} type TextKit
 * @param {string} str
 * @param {number} x @param {number} y
 * @param {{ anchor?: 'left'|'center'|'right' } & Record<string, any>} [opts]
 * @returns {number} 这一行的宽度（含 tracking）
 */
export function put(type, str, x, y, opts = {}) {
  return type.writeLine(str, x, y, opts);
}

/** `type.writeLine` 的直接转发（新代码可以直接用引擎那个，不必经过这里）。 */
export function writeLine(type, str, x, y, opts = {}) {
  return type.writeLine(str, x, y, opts);
}

/**
 * 整行淡入的选项工厂。
 *
 * 以前这里必须塞一个 `stagger: 1e-4` 才能让 `alpha` 生效（引擎的老 bug：
 * `k` 只在 `stagger > 0` 时才随时间走）。那个 bug 已经修了（`docs/history/IMPROVEMENTS-1-3.md` P1-3），
 * 所以现在就是干净的 `alpha: [0, to]`。
 *
 * ```js
 * type.write('标题', x, y, { ...fade(f.lt, 0.4), size: 96, color: css(P.bone) });
 * ```
 *
 * ⚠ **`alpha` 的两种写法语义不同**（`docs/history/IMPROVEMENTS-1-3.md` P0-1）：
 *   · `alpha: [a0, a1]`（数组，就是这个函数返回的）—— 随 t 从 a0 插值到 a1，**必须配 `t`**；
 *   · `alpha: 0.6`（数值）—— **常量**不透明度，与 t 无关。
 *   数值型 alpha 曾经被误当成"要动画"并取到 `k = 0`，于是整个字形**不画**（画面上一整块字消失）。
 *   想写固定不透明度就直接写数值，别为了"保险"写成 `[0.6, 0.6]`（那会引入对 `t` 的依赖）。
 *
 * @param {number} t 场景局部时间
 * @param {number} delay 延迟（秒）
 * @param {number} [to] 终值不透明度
 * @param {number} [dur] 淡入时长
 */
export function fade(t, delay, to = 1, dur = 0.5) {
  return { alpha: [0, to], t: t - delay, staggerDur: dur };
}

/** 打字机：返回前 k 比例个字符（确定性）。 */
export function typed(str, k) {
  return str.slice(0, Math.max(0, Math.min(str.length, Math.floor(k * str.length))));
}

/**
 * 等宽字体里的一行"代码"：segs 是 `[{ s, c }]`，按顺序画，返回总宽度。
 * 做协议名/参数/命令这类机器口吻的排版很有用。
 *
 * ⚠ 它**每段一次** `type.write`：播报式排版（`GET /v1/items` 那种色块分明）要的就是这个，
 *   但落在版面守门的记账里是 **n 条记录**。要让"几个标签只算一个看的地方"，用 `labelRow()`。
 */
export function codeRow(type, segs, x, y, opts = {}) {
  let cx = x;
  for (const sg of segs) {
    const w = type.measure(sg.s, opts);
    type.write(sg.s, cx, y, { ...opts, align: 'left', color: sg.c });
    cx += w;
  }
  return cx - x;
}

/**
 * **一行标注**：若干段 `{ s, c }`（文字 + 颜色）排成**一行**，自带分隔符，返回整行宽度。
 *
 * ## 为什么要有它（这是"省时间"的那一件，不是审美）
 *
 * 版面守门（`docs/LAYOUT.md`）判据 ② 数的是**观众要看向几个地方**，而它只能从"文字块"里数。
 * 于是 `LOW` / `MID` / `HIGH` 三个标签分三处写 ⇒ 三个"看的地方"；把它们合成一行 ⇒ **一块**。
 * 纪律本身没变（"一屏一个主体"），变的只是排版：一行读得完的标注，观众眼里本来也只有一处。
 *
 * ## 为什么是**一次** `writeLine`（不是"合并了字号/位置"就算）
 *
 * "一块"是 `src/core/text.js` 的 `noteText()` 记出来的 —— **每次**真的画出字形的
 * `write / writeLine / karaoke` 都往 `gl.paint.blocks` 里压一条。所以：分三次画就是三条记录
 * （即便挨得很近、被判据合成一块，读数也还是"3 次文字绘制"）。这里因此把整行拼成**一个字符串**、
 * **一次** `writeLine`：记账里就是 1 条，读者看到也确实是"一行"。
 *
 * ## 代价（写之前就知道，别事后惊讶）
 *
 * 一次绘制 = **一个颜色**。各段各自的 `c` 靠"按字符位置取色"实现（TextKit 的 `color`
 * 接受数组，按字素簇下标取）—— 颜色分得开，但**共用一次绘制**、一个 `alpha`、一套动画参数。
 * 想要"色块分明的代码行"那种排版（每段自己入场、自己发光），用 `codeRow()`；
 * 它本来就是**一行代码**、不是"一屏要看的一件事"，n 条记账在那里是对的。
 *
 * 位置：`x` 是锚点，`anchor` 决定它是整行的左边 / 中心 / 右边 —— 与 `writeLine` 同义。
 * 整行仍然只占**一个基线**：这一行的高度就是 `opts.size`，不会因为多段而变高。
 *
 * ```js
 * // 三个标签 → 一块（判据 ② 只数到 1）
 * labelRow(type, [
 *   { s: '波形', c: css(P.ash) },
 *   { s: 'LOW / MID / HIGH', c: css(P.signal) },
 * ], L.x0, 985, { size: 21, family: 'mono', gap: '　·　' });
 *
 * // 居中：x 是整行中心（宽度先量出来再定起点，不用自己算）
 * labelRow(type, [{ s: '采样率' }, { s: '48 kHz', c: css(P.bone) }], 960, 420,
 *   { anchor: 'center', size: 24 });
 * ```
 *
 * @param {any} type TextKit（`ctx.type`）—— 宽度必须在**这一段自己的**实例上量
 * @param {{ s: string, c?: string }[]} items 依次排开的若干段（`c` 省略 = 用 `opts.color`）
 * @param {number} x 锚点（含义由 `anchor` 决定）
 * @param {number} y 基线
 * @param {{ anchor?: 'left'|'center'|'right', gap?: string, color?: string, measureOpts?: any,
 *   } & Record<string, any>} [opts]
 *   `gap` 默认 `'　·　'`（全角空格夹一个间隔号：中文排版里最常见的分隔，不会被误当成正文）；
 *   `measureOpts` 是**量宽**用的样式（`{ size, weight, family, tracking }`，默认从 opts 里取 ——
 *   别在这里塞 `alpha` / `t` 这类与宽度无关的东西，那只会白白让缓存键变长）
 * @returns {number} 整行宽度（含分隔符与 tracking）
 */
export function labelRow(type, items, x, y, opts = {}) {
  const { anchor = 'left', gap = '　·　', measureOpts, color, ...style } = opts;
  const segs = (Array.isArray(items) ? items : [])
    .map((it) => (it && it.s != null ? { s: String(it.s), c: it.c } : null))
    .filter((it) => it && it.s !== '');
  // 量宽与画字用**同一套样式**：TextKit 的宽度缓存键里带字体串，两边不一致就会量出一个
  // 与画面不符的宽度（居中/右对齐立刻偏）。所以这里只挑与宽度有关的字段单独量。
  const mo = measureOpts ?? {
    size: style.size, weight: style.weight, family: style.family, tracking: style.tracking,
  };
  const widths = segs.map((sg) => type.measure(sg.s, mo));
  const gapW = segs.length > 1 ? type.measure(gap, mo) : 0;
  const lineW = widths.reduce((a, b) => a + b, 0) + gapW * Math.max(0, segs.length - 1);
  // 整行只发**一次**绘制 ⇒ 记账里就是 1 条（noteText 按"每次真的画出字形"记，见函数头注释）
  const text = segs.map((sg) => sg.s).join(gap);
  if (!text) return 0;
  const str = { ...style, anchor, color: color ?? undefined };
  if (segs.some((sg) => sg.c)) {
    /**
     * 各段自己的颜色**按位置取**：TextKit 的 `color` 接受数组、按字素簇下标取
     * （`colors[i % colors.length]`）。所以把数组铺成"每个字符一项"，第 i 个字就自然拿到
     * 它所在那一段的颜色 —— 一次性绘制仍然只有一个颜色通道，只是每个字不同而已。
     * 分隔符用**前一段**的颜色（它属于前一段的尾巴，不是新的一段）。
     */
    /** @type {string[]} */
    const colors = [];
    segs.forEach((sg, i) => {
      if (i > 0) for (let k = 0; k < gap.length; k++) colors.push(segs[i - 1].c ?? color ?? '');
      for (let k = 0; k < sg.s.length; k++) colors.push(sg.c ?? color ?? '');
    });
    str.color = colors.length ? colors : undefined;
  }
  type.writeLine(text, x, y, str);
  return lineW;
}

/** 确定性随机序列（永远不要用 Math.random —— 一帧会被拆成多个子帧乱序渲染）。 */
export function seqRnd(seed, n) {
  const r = rng(seed);
  return Array.from({ length: n }, () => r());
}

/** 便捷：两个颜色按 k 二选一（做"亮/暗"两套配色时省事）。 */
export function contrast(a, b, k) {
  return k < 0.5 ? a : b;
}

export { cssOf as css };
