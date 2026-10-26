// @ts-check
/**
 * 设计 token —— 把"审美"从模型手里拿走，落成几档数字（BACKLOG 1-46 / HANDOFF-directions §7）。
 *
 * ## 为什么需要这一层
 *
 * 2026-10-25 扫了 120 个场景文件的实测读数：
 *   · **字号用了 24 种取值，且集中在 15–30px**（24px×62 / 30px×60 / 22px×55 / 20px×54）；
 *   · **线宽 0.16–1.9px**，十几种取值，**没有 4px 以上的主笔**；
 *   · `prog()` **304 次** vs `spring()` **只有 4 次** —— 几乎全是匀速/平滑插值；
 *   · 后处理默认 `bloom .22 / grain .014` 偏"干净"。
 *
 * 合起来就是"画面是**均匀**的，不是**有主次**的" —— 均匀 = 信息图 / PPT，有主次 = 动效。
 * 而作者用的模型（DeepSeek v4.1-flash / GLM-5.3）**会填参数、不会设计**，所以正确做法是：
 * 让它写 `size: T.type.hero`，而不是让它想 `size: 24` 还是 `48`。
 *
 * ## 三条硬规则（写场景时守这三条，画面就不会回到"均匀"）
 *
 * 1. **一屏只有一个 hero 级元素**（`T.type.hero`），其余最多 h2 + label；
 * 2. **线宽只用三档**（`T.rule.hair / body / hero`），不许写 0.16 / 1.15 这种小数；
 * 3. **入场用 `T.motion.enter`（spring）+ 错峰 `T.motion.stagger`**；
 *    `prog()` 只用于"持续变化"（进度条、游标、波形游走）。
 *
 * ## 现状与下一步（别把这份文件当成"已经全部接进引擎"）
 *
 * 现在它只是**一份可 import 的常量表**：`tasks/_token-lab` 用它做了 before/after 对比图。
 * 真正铺开（写进 `src/style/` 的每套风格、让 `type.write` 认 `size: 'hero'`）是 BACKLOG 1-46 的下一步 ——
 * 那一步要先过 `hashes` 基线，并且**每套风格各出一次样片**再 `--accept`。
 */

/** 基础 token 表（= `print` 风格的取值）。 */
export const TOKENS = {
  /** 字号阶梯：比例 2.2–2.6×，一屏只有 hero 一个。 */
  type: { hero: 136, h1: 96, h2: 56, body: 40, label: 24, mono: 22 },
  /** 字重：hero 一定 ≥700，label 用 600 让它"读得出来"。 */
  weight: { hero: 800, h1: 700, h2: 650, body: 500, label: 600 },
  /** 线宽三档 —— 只有这三档，没有 0.16 这种"像素级微调"。 */
  rule: { hair: 1, body: 2.5, hero: 6 },
  /** 运动：入场弹簧、持续平滑、错峰秒数、回弹幅度。 */
  motion: { enter: 'spring', drift: 'smooth', stagger: 0.07, over: 1.05 },
  /** 版面：内容不超版面 60%，边距随画幅走（竖屏另有一套，见 HANDOFF §8）。 */
  pad: { x: 128, y: 96, block: 48 },
  /** 质感层：高级感来自"极轻的瑕疵"，不是干净。 */
  texture: { grain: 0.03, bloom: 0.30, vignette: 0.55, ca: 0.08 },
};

/**
 * 深合并出一份 token（`tokensWith({ type: { hero: 112 } })`）。
 * 场景不写这一层；它是给**风格包**留的接口（1-46 铺开时每套风格覆盖自己的几项）。
 * @param {any} over
 */
export function tokensWith(over = {}) {
  const out = {};
  for (const [k, v] of Object.entries(TOKENS)) {
    out[k] = v && typeof v === 'object' ? { ...v, ...(over[k] ?? {}) } : (over[k] ?? v);
  }
  for (const [k, v] of Object.entries(over)) if (!(k in out)) out[k] = v;
  return out;
}

/**
 * 「改造前」的取值 —— **只给 `tasks/_token-lab` 的对比图用**，不要在真实片子里 import。
 * 它复刻的是实测分布：字号挤在 15–30px、线宽 1px 上下、入场是匀速 `prog`。
 */
export const BEFORE_TOKENS = {
  type: { hero: 24, h1: 22, h2: 20, body: 19, label: 18, mono: 18 },
  weight: { hero: 700, h1: 700, h2: 600, body: 500, label: 500 },
  rule: { hair: 1, body: 1, hero: 1.1 },
  motion: { enter: 'linear', drift: 'linear', stagger: 0, over: 1 },
  pad: { x: 96, y: 72, block: 24 },
  texture: { grain: 0.014, bloom: 0.22, vignette: 0.40, ca: 0.06 },
};

/**
 * 语义字号的合法名字 —— 顺序就是字号阶梯（从大到小）。
 * 场景里写 `size: 'hero'`，**不要写 `size: 136`**：模型只填名字，不填数字（见文件头）。
 */
export const TYPE_SCALE = /** @type {const} */ (['hero', 'h1', 'h2', 'body', 'label', 'mono']);

/**
 * 把 `size` 归一成像素数（`type.write` / `writeLine` / `karaoke` / `wrap` 的入口都过这里）。
 *
 * 为什么抽成一个**纯函数**（而不是在 TextKit 里就地 `if`）：
 *   · 没有 DOM 依赖 ⇒ `tools/test-tokens.mjs` 能在 Node 里直接测「名字 → 像素 / 写错要抛」；
 *   · 语义字号的取值跟着**风格包**走（`ctx.style.tokens`），所以解析要能收到那份 token，
 *     而不是永远读模块级的 `TOKENS`（noir 的 hero 就该比 print 的大一号）。
 *
 * 三种输入：数字原样返回（含校验）；`undefined` / `null` 返回 `undefined`（交给调用方默认值 64，
 * 与从前逐像素一致）；语义名字查表，**写错直接抛** —— 拼错静默回落到 64 才是最贵的错法。
 *
 * @param {number|string|null|undefined} size
 * @param {{ type?: Record<string, number> }|null|undefined} [tokens] 这套风格的 token（可省略）
 * @returns {number|undefined}
 */
export function resolveTypeSize(size, tokens) {
  if (size === undefined || size === null) return undefined;
  if (typeof size === 'number') {
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`字号必须是正数，收到 ${size}（type.write 的 size）`);
    }
    return size;
  }
  const table = tokens?.type ?? TOKENS.type;
  if (Object.prototype.hasOwnProperty.call(table, size)) return table[size];
  throw new Error(
    `字号 "${size}" 不是语义字号。可用：${TYPE_SCALE.filter((k) => k in table).join(' / ')}`
    + `（也可以直接写数字；语义字号见 src/style/tokens.js，风格覆盖见 docs/STYLE.md）`,
  );
}

/**
 * 竖屏的字号放大系数（BACKLOG 1-52）。
 *
 * 为什么需要它：横屏的 1080 是**短边**，竖屏的 1080 也是短边 —— 按短边算比例，
 * 同一档字号的"占短边百分比"是一样的。但观众看竖屏时画面高 1920，
 * 一行 136px 的字只占高度的 7%（横屏是 12.6%），**看起来就是更小**。
 * 实测（`tasks/_portrait-lab` 的 1.0 / 1.2 / 1.35 / 1.5 四张对比图）：1.35 时
 * hero 的视觉重量与横屏相当，1.5 开始"标题吃掉半屏"。
 */
export const PORTRAIT_TYPE_SCALE = 1.35;

/**
 * 按画幅缩放一份 token（**只在 `H > W` 时调用**；横屏必须原样返回，否则老片子会变）。
 *
 * 只缩放**与画幅强相关的两组**：
 *   · `type` —— 字号阶梯（竖屏放大 1.35×，见 `PORTRAIT_TYPE_SCALE`）；
 *   · `rule` —— 线宽（跟着字号一起放大，否则竖屏的线细得像印刷网点）。
 * `weight` / `motion` / `pad` / `texture` 不动：字重与节奏跟画幅无关，`pad` 归栅格管，
 * 质感是"介质的瑕疵"，放大反而变成噪点。
 *
 * @param {any} tokens
 * @param {number} k
 */
export function scaleTokens(tokens, k) {
  if (!tokens || !(k > 0) || Math.abs(k - 1) < 1e-6) return tokens;
  const type = {};
  for (const [key, v] of Object.entries(tokens.type ?? {})) type[key] = Math.round(/** @type {number} */ (v) * k);
  const rule = {};
  for (const [key, v] of Object.entries(tokens.rule ?? {})) rule[key] = Math.round(/** @type {number} */ (v) * k * 10) / 10;
  return { ...tokens, type, rule };
}
