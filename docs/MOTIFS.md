# MOTIFS —— 母题库（`src/kit/motifs/`）

> **一句话**：同一个视觉母题会在很多片子里反复出现（拆方波、块变换、一条波形 + 游标）。
> 母题库把它们从"每支片子重抄一遍"变成"给参数"。
> 待办与判据见 [`BACKLOG.md`](./BACKLOG.md) 的 `1-49`。

---

## 1. 为什么有这一层

`AGENTS.md` §4.5 的第 ③ 条是「**一个走完全片的母题** —— 眼睛有得跟，切了也像没切」。
真正写起来，这个母题往往是**一堆数学**：傅里叶级数、DCT、采样与折线 ——
`tasks/spectrum` 那支片子里，同一套"方波 = 一串圆"在每个镜头都重抄了一遍。

母题库回答的问题不是"怎么画"，而是**"同一件事只写一次"**。它们的共同约定：

| 约定 | 为什么 |
|---|---|
| **纯函数优先** | 能不进 GPU 就不进 —— `tools/test-motifs.mjs` 能直接测（38 项） |
| 只碰 `lines` / `type` | 画到哪个目标由场景决定；**`flush()` 必须传 `ctx.out`**（不传会画到引擎默认目标，症状是"文字在、线没了"） |
| 不读 `Math.random()` / 墙钟 | 与引擎铁律一致（AGENTS.md §4） |

---

## 2. `fourier` —— 方波 = 一串圆

```js
import { squareCoeffs, squareWave, growK, epicycles, drawEpicycles } from '../../../src/kit/index.js';

const C = squareCoeffs(8);                       // 8 项奇次谐波（4/πn）
const k = growK(f.lt, 2.2, C.length);            // 前 2.2 秒把项数从 1 长到 8（连续值）
const e = epicycles(C, k, f.t * 1.1);            // 一串圆 + 笔尖位置
drawEpicycles(ctx.lines, e.circles, { cx: 520, cy: 560, scale: 190, color: ink, accent: sig, target: ctx.out });
const v = squareWave(f.t * 1.1, k, C);           // 同一时刻的级数值（-1.18 … 1.18，含 Gibbs）
```

`epicycles()` 的末端 y **恒等于** `squareWave(t, k, C)` —— 这不是巧合，是同一条级数；
`tools/test-motifs.mjs` 用 1e-12 的容差钉着它。适合：信号 / 近似 / "简单的东西叠出复杂形状"。

---

## 3. `dct` —— 8×8 块变换与有损重建

```js
import { dct2, idct2, normalizeBlock } from '../../../src/kit/index.js';

const coef = dct2(block);                                   // 64 个 { u, v, c }
const low  = normalizeBlock(idct2(coef.filter((c) => c.u <= 1 && c.v <= 1)));
```

⚠ **`normalizeBlock()` 不是作弊**：只留高频时重建值域只有 ±0.3（高频没有"亮度"、只有"边缘"），
不按 min/max 拉伸就只是一块几乎全黑的格子。拉伸只改对比度、不改形状 —— 形状是变换算出来的。
适合：压缩 / 频谱 / "丢了什么"。

---

## 4. `waveform` —— 采样、游标、刻度

```js
import { wavePoints, drawWave, drawTicks, playheadX } from '../../../src/kit/index.js';

const pts = wavePoints({ x0: 140, x1: 1780, yMid: 640, amp: 180, fn: (τ) => Math.sin(τ * 2) });
drawWave(lines, pts, { width: 3, color: ink });
drawTicks(lines, { x0: 140, x1: 1780, y: 640, step: 80, color: dim });
lines.flush(ctx.out);
```

`wavePoints()` 会把 `fn` 吐出的 `NaN` 兜成 0（别把 NaN 画进顶点缓冲），
并保证 x 严格递增 —— 这两条都有测试。

---

## 5. 夹具与回归

```sh
node scripts/anim.mjs still _motif-lab -t 3,8     # 两个母题各一段的样片
node tools/test-motifs.mjs                        # 38 项纯逻辑（级数收敛 / DCT 往返 / 归一化 / 采样）
```

`tasks/_motif-lab/` 是夹具，不是片子：它的作用是"母题在这儿能跑"，以及下次改母题时**有个地方看**。

---

## 6. 现状与下一步

| 来源任务 | 抽了吗 | 说明 |
|---|---|---|
| `tasks/spectrum` 的方波 / 圆链 / DCT | ✅ `fourier` + `dct` + `waveform` | 本次抽的就是它 |
| `tasks/sodium` 的积木、`tasks/bikeshed` 的会议室 | ❌ **没抽** | 这两个任务目录被 `.gitignore` 排除（含真实素材），**本仓库里没有** |
| `beast` / `fidus` / `nekohome` 的私有 `_kit.js` | ❌ **没删** | 同上：那些任务不在这个 checkout 里 |

→ 要接着抽，得先把那三支片子的任务目录放回 `tasks/`（它们不进仓库）；
抽完用 `hashes --accept --note` 记录画面变化。
