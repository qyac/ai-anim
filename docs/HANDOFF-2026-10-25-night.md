# HANDOFF · 2026-10-25 夜（W3：语义字号落地 + 两个采样 bug）

> **一次性交接单**，假设读者看不到产生它的会话。待办仍以 [`BACKLOG.md`](BACKLOG.md) 为准。
> 这一轮做了三件事：**验环境 → 修两个采样 bug → 把 W3（1-46）做完**。

---

## 0. 一分钟版本

1. **渲染环境验通**（`check spectrum` 从 27 条红 → **0 条红**）：GPU 是真的（AMD Radeon / ANGLE D3D11 / floatRT）。
2. **修掉两个自适应采样的 bug** —— 它们让「写了 `maxSamples: 8` 的段」成片比预览**暗 27%**，
   而 `maxSamples: 8` 正是 HANDOFF-spectrum-friction §1 里作者用来提速的那个旋钮（spectrum 全片在用）。
3. **W3 / 1-46 收尾**：`type.write` 认语义字号（`size: 'hero'`）+ 四套风格各自的 token 覆盖 + 六张风格样片。

---

## 1. 两个采样 bug（都修了，都在 `src/core/engine.js` 的 `render()`）

`check spectrum` 报的 27 条红全是同一句：**「单子帧与多子帧亮度差了 0.73×」**，
且只出现在 `hook / series / series2 / sound` 四段 —— 正好是**写了 `maxSamples: 8`** 的四段。

### bug ①：一级到底（`maxSamples: 8`）时，前半段子帧被丢掉

新加的「拆两半做静止判据」把 8 个子帧拆成 `newRT`(0..3) + `sumRT`(4..7)，
而**合并那一行写在 `else` 分支里**：

```js
if (done >= maxSamples) { verdict = { stop:true, reason:'cap' } }   // ← 一级到底，跳过合并
else { …err0…; acc.render(gl, sumRT); … }                            // ← 只有这里合并
```

于是 `sumRT` 里只有 4 个子帧，而除数仍是 `done = 8` ⇒ `avgRT = 4 帧之和 / 8` = **一半的光**。
显示空间上是 **0.73×**（线性 0.5 → sRGB ≈ 0.73），不是"看不出来"。
**凡给段写了 `maxSamples: 8` 的片子，成片都比预览暗 27%**。

修法：合并移出分支，**任何判定下都合并**（除数与累加数必须一致）。

### bug ②：`newRT` 在第一级没清零

`newRT` 是**加性**累加目标，以前只在 `while` 循环里（新一级开始前）清过，**第一级从来没清**。
于是第 N 次自适应渲染的"前半段" = 本次 4 帧 + **上一帧的残影** ⇒ 越渲越亮或越渲越暗，
同一帧渲两次结果不同。修法：第一级累加前 `this.gl.clear(this.newRT, …)`。

### 证据

| 检查 | 修前 | 修后 |
|---|---|---|
| `still spectrum -t 1.5 --samples 1` | YAVG 214.84 | 214.84 |
| `still … --samples 8`（非自适应） | 214.73 | 214.73 |
| `still … --samples auto`（成片路径） | **161.41（0.75×）** | **214.80**（连渲两次同值） |
| `check spectrum` | ✗ 27 条 | ✓ 0 条（只剩响度 −16.5 LUFS 那条已知告警） |
| `tools/test-sampling.mjs` | 51 项 | 51 项（未受影响） |

⚠ **上一个提交（`fca3cd8`）之前的代码没有这个 bug**（老实现是 8 帧全进 `sumRT`，不拆半）。
所以**已交付的 `spectrum.mp4` 是对的**；危险的是"用它之后重新渲一遍"。
→ 任何用 `maxSamples: 8` 的任务，在这次修复前重新出片都会暗 27%，**修完再渲**。

---

## 2. W3：`type.write` 认语义字号（1-46 收尾）

```js
type.write('把方波拆开', 140, 330, { size: 'hero', weight: 800, color: css(P.bone) });
type.write('FOURIER · 4 项', 140, 176, { size: 'label', family: 'mono', color: css(P.ash) });
```

* 阶梯六档：`hero / h1 / h2 / body / label / mono`（`src/style/tokens.js` 的 `TYPE_SCALE`）。
* 取值来自**这套风格的** `ctx.style.tokens`：引擎在 `applyStyleFonts()` 里把 token 下发到
  每个图层的 `TextKit`（一层一份），所以同一份场景换 `--style` 之后层级还在。
* **写错直接抛**（列出可用名字）。回落成默认 64 才是最贵的错法 —— `tools/test-tokens.mjs` 钉住了这条。
* **数字仍然合法**：`size: 24` 原样通过 ⇒ 120 个老场景一个像素都不变。
* 覆盖的 API：`write` / `writeLine` / `karaoke` / `wrap` / `paragraph` / `writeOnPath` / `measure` / `layout`。

### 各风格的覆盖（`src/style/index.js`）

| 风格 | hero | 理由 |
|---|---|---|
| `print` / `flat` | 136 | 吃 `tokens.js` 的基线 |
| `blueprint` | 120 | 工程图偏"密"，标注要留得住细节 |
| `paper` | 128 | 宋体字面小，正文 42 / 标注 26 给回来 |
| `terminal` | 112 | 等宽字窄，整套收一档；错峰 0.05 |
| `noir` | 152 | 电影感 = 更少更大的字；hero 字重 900 |

### 样片（六套各一张，接触表一张）

```sh
node scripts/anim.mjs still _token-lab -t 6.5 --style <名字> --out out/_token-lab/styles/<名字>
# → out/_token-lab/styles/{print,blueprint,paper,terminal,flat,noir}/f_0006.500.png
#   接触表：out/_token-lab/styles/_sheet.png（3×2）
```

夹具 `tasks/_token-lab/scenes/token.js` 也改成了**两条路并存**：`after` 段写语义名字（吃风格 token），
`before` 段写数字（对照组），所以这张图现在同时是"token 前后对比"和"跨风格对比"。

### 测试与文档

* 新增 `tools/test-tokens.mjs`（**38 项**，纯 JS）+ 挂进 `tools/regress-all.mjs` 的 `unit:` 组。
* `docs/STYLE.md` 新增 **§4.1 语义字号**（含六套风格的 hero 对照表 + 三条规矩）。
* `AGENTS.md` §5 的 `text`+`type` 那一行加了一句（体积守门仍绿）。
* `docs/BACKLOG.md` 的 `1-46` 划掉，证据写在行内。

---

## 3. 这台机器的两个环境坑（不是仓库的问题，但会挡住下一个人）

| 现象 | 真因 | 绕法 |
|---|---|---|
| `browserType.launch: spawn UNKNOWN` / 「应用程序的并行配置不正确」 | **Chrome 装残了**：`C:\Program Files\Google\Chrome\Application` 只有 12MB，`chrome.exe` 是个壳，`143.0.7499.169\` 里只有 `Installer`，**没有 chrome.dll** | 重装 Chrome；本次全程临时把 `scripts/anim.mjs:947` 的 `channel: 'chrome'` 改成 `'msedge'`（Edge 156 完好），**已改回** |
| `Unrecognized option 'x264-params'`，然后**引擎挂住不动**（不报错） | PATH 里是 **LGPL 构建**的 ffmpeg（`ffmpeg-n8.1-latest-win64-lgpl-shared`），**没有 libx264** | 装 GPL 全量构建（`winget install Gyan.FFmpeg`）或用 `--vcodec h264_mf`（实测 7.7 fps 出片、ffprobe 复核通过）。⚠ ffmpeg 死掉时 CLI **不会报错，会一直等帧** —— 这是 §4-D 那条的同类问题，值得单独修 |

---

## 4. 下一会话从这里接

1. **`1-45` 块级增量重渲**（W6）—— 仍然是"敢返工"的前提。
2. ~~**`1-52` 竖屏**~~（W4–W5）—— **已完成，见 §5**。
3. **`1-51` 判据元测试**：这次的两个 bug 说明"判据会静默失效"仍然成立 —— `check` 抓到了，
   但 `tools/` 里没有任何纯 JS 测试能抓到它（它需要 GPU 累加）。若要补，最省事的做法是给
   `_calib` 加一段 `maxSamples: 8` 的夹具，让 `check` 的"两条路径一致"成为回归项。
4. **ffmpeg 死亡不冒泡**：`spawn` 后没有监听 `ff.on('error')`/`close`，编码器一死就无限等帧。
   建议加一条"ffmpeg 退出 ⇒ 立即非零退出并删产物"（与 `video` 的产物复核同一条纪律）。

---

## 5. 追加（2026-10-26 早上）：1-52 竖屏落地

**结论：竖屏不需要放宽任何判据。** 改的是"几何按画幅走"，不是"阈值松一点"。

### 5.1 改了什么

| 位置 | 内容 |
|---|---|
| `src/style/index.js` | `GRID_PORTRAIT`（1080×1920 基准：`pad 88` / `top 104` / `contentBottom 1112` / 字幕带 `[1180,1344]` / `footerY 1622`）+ **`fitStyleToFrame(style, W, H)`**：`H > W` 时换栅格（按**短边=宽**缩放，`× W/1080`）与字号；`resolveStyle` 多出 `gridPortrait` 字段（可被任务/风格覆盖） |
| `src/style/tokens.js` | `PORTRAIT_TYPE_SCALE = 1.35` + `scaleTokens()`：**只放大 `type` 与 `rule`**，`weight` / `motion` / `texture` 不动 |
| `src/core/engine.js` | `load()` 里 `this.style = fitStyleToFrame(...)`；`_scaledGrid()` 不再二次按 `H/1080` 缩放（那是竖屏 ×1.777 的根源） |
| `src/kit/bands.js` | 竖屏的 `sub` 带按 **84% 内容宽**算（横屏 0.19×2 在竖屏会把"字幕其实压到的位置"判成没压 —— 假阴性） |
| `src/core/captions.js`（经 `fitStyleToFrame`） | 竖屏字幕：`size ×1.35`、每行 12 字、`position: 'bottom'` |
| `scripts/anim.mjs` | 新增 **`ANIM_CHANNEL`** 环境变量（默认 `chrome`）—— 这台机器的 Chrome 装残了，以前只能改源码 |

### 5.2 为什么是 1.35，不是"按高缩放"

横屏与竖屏的短边都是 1080：按短边算，136px 的"占短边比例"一样。但竖屏高 1920，
同样 136px 只占高度的 7%（横屏 12.6%）⇒ **看起来更小**。取 1.35 后 hero ≈ 184px，
四个汉字占短边 68%（横屏是 28% 的宽度），视觉重量相当；1.5 时标题吃掉半屏。

### 5.3 实测（`tasks/_portrait-lab/`）

```
check _portrait-lab：
  版面守门：2/2 段采到文字绘制 · 最挤的一帧 4 块（上限 6；主体之外 ≤ 2）
    hero  t=1.05s  4 块  主体区 0 块字（主体是图形：2 次非文字绘制；4 块字全是标注）
    bars  t=7.60s  3 块  主体区 0 块字（同上）
  节奏（静态）：CoV 0.39  ·  ≥ 0.25
  单帧 0.097 / 多子帧 0.097  —— 两条路径一致
  ✓ 没有发现问题
```

第一版夹具触发过两次，都是**画面该改**而不是阈值该松：
① 三个读数分开写（34 / 62 / 88）被数成 3 个"看的地方" → 合并成一行（`labelRow` 纪律）；
② 读数写在柱子基线下方、正压字幕带上沿 → 改成写在柱顶上方。

### 5.4 回归

* `tools/test-portrait.mjs` **39 项**（新）：横屏**原样返回同一个对象**（老任务零变化）/
  栅格按短边缩放 / 字号 ×1.35 / 字幕带 61%–70% 且在 B 站 UI 之上 / `gridPortrait` 可覆盖。
  已挂进 `regress-all` 的 `unit:` 组。
* 横屏回归：`check demo --quick` ✓ 没有发现问题（与改动前同样的 2 条 skipped）。
* `test-style` 66 / `test-tokens` 38 / `test-layout` 47 / 三个 lint 全绿。

### 5.5 下一会话

`1-45` 块级增量重渲（W6）是主线上剩下的第一条。`1-51` 判据元测试也还开着
（这次两个采样 bug 只能靠 `check` 抓，纯 JS 侧没有防线）。

---

## 6. 追加（2026-10-26）：编码器兜底 + ffmpeg 死亡不再静默

原来那两条"环境账"里，**ffmpeg 死亡不冒泡**已经修掉；LGPL 构建缺 libx264 也不再需要人肉换参数。

| 改动 | 位置 | 效果 |
|---|---|---|
| `pickVideoEncoder()` | `scripts/anim.mjs` | 出片前探一次 `ffmpeg -encoders`（缓存）。默认 `libx264` 不存在时自动退到 **`h264_mf`**（Windows 硬件编码）→ `libopenh264` → 报错并给出两条出路。默认链路直接可用 |
| `ANIM_VCODEC` | 同上 | 给"这台机器固定用某个编码器"留的口子（优先级低于 `--vcodec`） |
| ffmpeg 提前退出即失败 | `ff.on('close')` | 以前只记账，页面还在推帧、CLI 一直等到看门狗（300s）；现在**立刻收工**并说人话：退出码非 0 ⇒ "先查编码器，别急着重跑" |
| `ff.stdin` 的 EPIPE | 同上 | 加 `error` 监听 + `end()` 前查 `destroyed`，不再抛一段 Node 栈 |
| 退出码转有符号 | `signedExitCode()` | `4294967274` → **`-22`**（EINVAL），报错可读 |

实测（本机，Chrome 156 + LGPL ffmpeg）：

```
node scripts/anim.mjs shot demo --from 0 --to 2          # 默认链路
⚠ 这台 ffmpeg 没有 libx264（多半是 LGPL 构建），改用 h264_mf。
✓ out\demo\shot_0-2.mp4   120 帧（ffprobe 复核 120 帧）  7.7 MB

node scripts/anim.mjs shot demo --from 0 --to 0.3 --vcodec h264_amf   # 故意失败
✗ 只渲染了 5/18 帧 … 这一条是 ffmpeg 提前退出（不是页面断流）⇒ 先查编码器
用时 8.3s（以前会挂到看门狗 300s，实测有人挂了 20 分钟）
```

⚠ 想按原配方（`crf16` + `tune grain`）出片仍然要 GPL 全量构建：
`winget install Gyan.FFmpeg`（本次尝试从 gyan.dev 直连下载 114MB 的 zip，速度只有 ~9 KB/s，
半小时才 16MB，已放弃 —— 走 winget 或手动装更快）。


---

## 7. 追加（2026-10-26 中午）：ffmpeg 换 GPL 构建 + 1-45 块级增量重渲

### 7.1 ffmpeg

`winget install Gyan.FFmpeg` 装好了 **9.0.2 full build**（带 libx264 / libx265）。
它没进 `PATH` 的第一个位置（用户 PATH 里 `Downloads\ffmpeg\...lgpl-shared` 排在前面），
所以用引擎自己的口子固定下来 —— 用户级环境变量：

```
ANIM_FFMPEG  = %LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_...\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe
ANIM_FFPROBE = ...\bin\ffprobe.exe
```

实测：`shot demo --from 0 --to 2` 走 libx264 crf16 + tune grain、ffprobe 复核 120 帧通过。
⚠ **颗粒素材在 crf16 下极占空间**：2 秒 = **55.6 MB**（75 秒的片子 ≈ 2 GB）。
草稿/回归用 `--crf 20` 或 `--preset veryfast`，定稿再上原配方。

### 7.2 1-45 块级增量重渲（已落地）

| 位置 | 内容 |
|---|---|
| `scripts/lib/blocksig.mjs`（新） | `sceneFileIndex()`：段 id → 场景源文件（静态扫 `id:` / `makeShot(` / `shot(`）；`blockSignature()`：渲染参数 + 引擎签名 + 这一块**真正跨过**的段的文件与段参数 |
| `renderSegments()` | 逐块比对签名：`params` 变 ⇒ 整批重渲（P1-1 的结论不破）；`tasks/` 变 ⇒ 只重渲签名变了的那几块；`src/` 变 ⇒ 引擎签名进每一块 ⇒ 整批失效 |
| `tools/test-block-sig.mjs`（新） | 21 项纯 JS 断言（含"改一个镜头只有它那块失效"、"查不到源文件的段永远重渲"） |

实测（`demo`，4 块 / 999 帧 / `--draft`）：

| 场景 | 用时 |
|---|---|
| 首次全渲 | 47s |
| 什么都不改 | **0.9s**（4 块全跳过） |
| 只改 `chart.js` | **15.3s**（只重渲第 2 块 4–9s） |
| 改 `--samples 1→2` | 整批重渲，并打印 `samples: "1" → "2"` |

两个坑，都写进代码注释了：
1. **块签名里不要给时间边界加 padding**：第一版放了 ±0.5s，结果"改 chart.js 却重渲了 3 块"
   —— 交叠段本来就满足 `end > from && start < to`，再加 padding 只会把边界外的段拖进来。
2. **首次升级会整批重渲一次**：块签名从"时间区间"换成"内容指纹"，还顺带把路径分隔符统一成 `/`
   （跨平台一致）。这一次之后才会稳定复用。

---

## 8. 追加（2026-10-26）：1-51 判据元测试

`tools/test-gates-meta.mjs`（**37 项**，挂 `regress-all` 的 `meta:gates`）。

骨架统一成两条，缺一条都算没验：

```
注入缺陷  → 判决**必须报**（红证明）
去掉缺陷  → 判决**必须不报**（对照组：防"夹具本身永远报"）
```

覆盖：

| 判据 | 红证明 | 对照 |
|---|---|---|
| 版面·一屏块数 `blocks` | 7 块（每块独占一行） | 6 块 = 上限 |
| 版面·主体区 `in-focus` | 主体区 3 块 | 2 块 = 上限 |
| 版面·主体外 `off-subject` | 主体外 4 块 | 3 块（offSubject=2） |
| 背景守门 `missing` / `blackTail` | `full=0` / 窗后中点 mean≈0 | `full=1` |
| 采样 `tol` / `cap` / `stall` | 三个出口各一条 | 对应的"继续加档" |
| 采样 **NaN** | `err=NaN ⇒ 不许 stop` | 真误差 ⇒ 正常判 |
| 误差量具 | **全 0 直方图 ⇒ 0**（那个 bug 的形状） | 真直方图 ⇒ 高分位 |
| 节奏节拍器 | 等长 4 段 ⇒ `metronome=true` | 7/4/1.5s ⇒ false |

文末还有一张**覆盖表**，把"哪个判据的红证明在哪"列全，并**点名缺口**：
`lint-narration-dup`（旁白复述）只有 CLI 侧实现，没有纯函数红证明。

夹具本身踩的三个坑（都写进注释了）：
1. 块要在**行方向上拉开**（或独占一行），否则会被 `textGroups` 合并成一块（gap 28）——
   第一版 7 块被合成 2 组，判据当然不报；
2. `offSubject` **不数第一个**"看的地方"（那是主体入口），`maxOffSubject=2` 要 4 块才越线；
3. `worldAuditVerdict` 的 `blackTail` 读的是**第二条**样本（窗后中点），只传一条永远不红。

---

## 9. 追加（2026-10-26）：1-49 母题库（部分）

`src/kit/motifs/` 落地，统一从 `src/kit/index.js` 再导出：

| 模块 | 内容 | 来源 |
|---|---|---|
| `fourier` | `squareCoeffs` / `squareWave` / `growK` / `epicycles` / `drawEpicycles` | `tasks/spectrum` 的「方波 = 一串圆」 |
| `dct` | `dct2` / `idct2` / `normalizeBlock`（8×8，JPEG 口径） | `tasks/spectrum/scenes/keep.js` |
| `waveform` | `wavePoints` / `drawWave` / `drawTicks` / `playheadX` | 各镜头重抄的"采样折线 + 游标" |

验证：`tools/test-motifs.mjs` **38 项**（级数 RMS 随项数递减 / Gibbs 过冲 1.15–1.22 /
本轮末端 == `squareWave()` 到 1e-12 / DCT 往返 <1e-9 / 归一化不改形状 / 采样不出 NaN 且 x 单调 /
游标越界夹住），夹具 `tasks/_motif-lab`（两段样片），文档 `docs/MOTIFS.md`。

### 9.1 一个**重复犯的**坑：`lines.flush()` 不传目标

母题夹具第一版**文字在、线全没了**：`drawEpicycles()` 里写了 `lines.flush()`（没传 `ctx.out`）。
屏幕/导出目标由调用方决定，不传就落到引擎默认目标 —— 画了，但不在这一帧上，且**不报错**。
现在 `drawEpicycles()` 收 `target`，夹具里两处 `flush` 都显式传 `ctx.out`。

顺带一个量图技巧（模型看不了图时）：`ffmpeg -vf "crop=W:H:X:Y,signalstats"` 量某个矩形的平均亮度，
或 `node tools/png-rows.mjs <png> <x>` 看某列上"亮度>0.5 的 y 区间"——线在不在，一秒就知道。
第一版圆用 `P.ash` + 0.45 alpha，量出来 27.5（背景 25 左右），换成 `P.bone` 0.55 后同一列出现了
y=335 / 823 两段笔画 —— **"看着有点暗"和"根本没画"在数字上是两回事**。

### 9.2 没做完的部分（诚实登记）

`sodium` 积木 / `bikeshed` 会议室 / `beast`·`fidus`·`nekohome` 的私有 `_kit.js`：**都没抽**
—— 这些任务目录被 `.gitignore` 排除（含真实素材与音频），**本 checkout 里根本不存在**。
要接着抽，得先把那几个任务目录放回 `tasks/`，抽完用 `hashes --accept --note` 记录画面变化。
