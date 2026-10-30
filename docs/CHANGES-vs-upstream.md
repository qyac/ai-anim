# 我们在上游 `main` 之上做了什么

> 对照基线：**`237e985`**（我们从 suan-11/ai-anim 分叉时的那一个提交）。
> 复现命令（任何时候都能重新算一遍）：
>
> ```sh
> git log --oneline 237e985..HEAD          # 20 个提交
> git diff --stat 237e985..HEAD            # 311 files, +56317 −378
> git diff 237e985..HEAD -- src            # 只看引擎
> ```
>
> 上游之后如果又动了，把 `237e985` 换成 `$(git merge-base HEAD github/master)` 再跑。

## 一、总量

```
20 个提交 · 311 个文件 · +56,317 / −378 行

目录         文件    新增行   删除行
tasks        185   51,065     298     ← 片子（15 支 nuomi + 主片 + 实验夹具）
tools         21    1,631      10     ← 判据与工具（12 个是新增的）
src           24    1,556      32     ← 引擎：4 个新原语、4 个新模板、15 套风格
docs          33    1,344      16     ← 4 篇新文档 + 23 张镜头卡 + 索引
scripts        5      567      14     ← CLI：report / shot-cards / icons / assets
根目录          3       89       8     ← AGENTS.md / index.html / package.json
.github        1       37       0     ← CI
.githooks      1       16       0     ← 预提交钩子
assets         1       12       0     ← 共享素材 manifest
```

**没动的部分**：`src/core/` 里的 `gl.js` `text.js` `sampling.js` `trans.js` `cam.js` `glsl3d.js`
`captions.js` `cjk.js` `narration.js` `audio.js` `scene.js`，`src/timeline.js` `src/tasks.js`，
以及 17 个老模板（bigtype、counter、kinetic、layers、lineart、lockup、morph、quote、radial、scan、
timeline、title、wave、whip、grid、outro、pulse 全部原样）—— **渲染地基一个字没改**，这是刻意保持的。

| # | 提交 | 内容 |
|---|---|---|
| 1 | `dc03518` | 配置档任务的按段切片签名（1-59）+ 表情包图层 + nekoclicker 介绍片 |
| 2 | `8c3f1c9` | 卡点/事件密度两条守门 + 多语言配音链路 |
| 3 | `cd9044d` | 预览工作台首发 + 15 套 MG 风格包 |
| 4 | `3b69297` | 风格调色板：world Pass 缓存 key + 底色判据 |
| 5 | `0a47f6c` | 底色语义统一（bg）+ 像素化 post 参数 |
| 6 | `b7ae42b` | 工作台拖动快路径（skipPost）+ 更正 scrub 度量口径 |
| 7 | `938b2a0` | `anim report`：一屏 5 项自检 |
| 8 | `a960eb2` | 主片事件密度 43% → 13% |
| 9 | `7b93be6` | 工作台第二阶段：参数面板 + 实时后处理覆盖 |
| 10 | `6d9aaf1` | 新模板 `isometric`（等距 2.5D 体块） |
| 11 | `7880a89` | 预提交钩子 + GitHub Actions 纯 JS 回归 |
| 12 | `11e3620` | AGENTS §10 加 11.7（钩子会跑 report） |
| 13 | `d9956f5` | 线条沸腾原语 + `cel` 模板 |
| 14 | `0d387ba` | 流体原语（域扭曲 + 涟漪）+ `liquid` 模板 |
| 15 | `d15a222` | 内置矢量图标 26 个 + 素材库分层策略 |
| 16 | `37b9a9c` | 共享位图素材（manifest + 加载器 + 校验） |
| 17 | `364f23d` | 图标接进 `compare` / `device` |
| 18 | `685b491` | 镜头卡 23 张 + 判例式准则 `docs/RULES.md` |
| 19 | `e146cd9` | AGENTS：沙箱里怎么推仓库 |
| 20 | `4d57d6a` | 音效层：SoundDino 抓取工具 |

## 二、六块改动

### A. 引擎核心（`src/core/`，+356 行）

| 文件 | 改了什么 | 为什么（都是「不报错但结果不对」那类） |
|---|---|---|
| `audio-analysis.js` | `estimateTempo` 重写：分数延迟 + 去掉 120bpm 先验 + 底鼓锚定 + 格点精确率×召回 + 最小二乘精修 | 合成床 80bpm 被估成 83.3（偏 4%），整片卡点全飘 |
| `engine.js` | `livePost`（工作台实时覆盖，永远最后合并）；`skipPost` 拖动快路径；`gl.paint` 空值守卫 | ① 滑块要能实时看；② 拖 scrub 时省掉后处理；③ 错误分支里 `paint` 已被摘成 null，崩在报错路径上 |
| `palette.js` | 新增显式 `bg`（默认 = `ink`） | 底色以前是隐含约定：`gl.clear`/`worldPass` 用 `ink`、`chart` 的纸面用 `bone`，换风格就「背景反色」 |
| `post.js` | 新增 `pixel` 参数（uv 量化 N×N + 最近邻） | 像素风不能只换色板，要真出块 |
| `world.js` | 共享背景 Pass 的缓存 key 补调色板指纹 | 同 key 会复用上一套风格建的实例 → 换了风格背景不换 |
| `app.js` | 预览工作台全部逻辑（+228） | 见 B |
| `style/index.js` | 注册 15 套 MG 风格 | 见 D |

### B. 预览工作台（上游没有，`src/app.js` + `index.html`）

从「播放器」升级成「编辑反馈回路」：

- **时间轴 scrub** + **场景/节拍刻线**（段边界白线、长段带段名、有音乐时叠拍点）；
- **走带**：播放/暂停、上下段、±1 帧、**循环当前段**；
- **精确帧按钮**：按导出同一条路径（多子帧）重渲当前帧，并报与 1 子帧预览的 **MAE / PSNR**；
- **参数面板**：风格包（21 套下拉）、主色、泛光/颗粒/暗角/像素化滑块 —— 数值项写 `livePost` 实时生效，结构项走带参重载；
- **拖动快路径**：拖 scrub 时 `skipPost`，松手补一次完整渲染（实测完整链路 p50 3.4ms、快路径 2.1ms）；
- **agent 接口**：`__anim.preview(t)` / `previewRange(t0,t1,n)`（缩略拼图）/ `precise(t)`；
- `window.__animPalette` 调试出口：给「底色到底有没有画上去」这类判据用。

### C. 镜头库：23 个模板（上游 20 → +3）

| 新模板 | 干了什么 | 关键实现 |
|---|---|---|
| `isometric` | 等距 2.5D 体块，一格一格从地面长起来 | 画家算法排序（线段批没有 z-test）、只画朝镜头三面、`spring()` 落位不累积 |
| `cel` | 逐帧手绘 / 线条沸腾 | 纸面 Pass + 每 2 帧重描的线，抖动来自 `hash(帧组, 线号)` |
| `liquid` | 域扭曲流体底 + 同心圆涟漪 | 两层 fbm 域扭曲；涟漪是 `ripple(t - birth)` |
| （`compare` / `device` 加参数） | `compare.icons` 行业图标、`device.icon` 应用图标 | 图标走内置矢量库，不传就完全不画（旧画面逐像素不变） |

### D. 风格包：21 套（原 6 → +15）

`src/style/mg15.js`：把 <https://github.com/Vincentwei1021/mg-styles-15> 的 15 种 MG 风格落地成风格包
（`mg-cel` `mg-isometric` `mg-flat-vector` `mg-lineart` `mg-soft3d` `mg-morph` `mg-sticker` `mg-hud`
`mg-collage` `mg-aurora` `mg-bauhaus` `mg-vhs` `mg-pixel` `mg-liquid` `mg-variety`），每套带色板/字体/
后处理基线/栅格/字幕样式/字号阶梯。其中 3 个「骨」已由引擎原语支撑（cel / isometric / liquid + pixel）。

### E. 判据与工具（`tools/`，12 个新增）

| 工具 | 判据 |
|---|---|
| `lint-beat-align.mjs` | 切点对拍子：从音频**自己重建**拍网格，不信 `analysis.json` 的 bpm；最小二乘精修，±30ms |
| `lint-event-density.mjs` | 每一秒都有东西看：4fps 灰度帧间差，最长静止 ≤3.5s、稀薄窗口 ≤25% |
| `test-style-palette.mjs` | 底色真的画上去了：画面角落像素 vs `__animPalette.bg`，+ 亮底/暗底分档 |
| `lint-prog-range.mjs` | `prog(t,a,b)` 里 `b ≤ a`（元素永远不出现） |
| `test-tempo.mjs` / `test-event-density.mjs` | 上面两条判据自己的回归（合成素材，不依赖片子） |
| `precommit-report.mjs` | 提交前跑 `anim report`，判据红就拦（只读成片、不渲染） |
| `gen-shot-cards.mjs` | 从模板 meta 生成 23 张镜头卡 + 索引，`--check` 保证新模板不漏分类 |
| `sfx-fetch.mjs` | 从 SoundDino 取音效，写 manifest（id/来源/许可/sha1），限速 + 每次 5 条 |
| `nuomi-{vary,shuffle,vo,vo-ja}.mjs` | 15 支短片的去同质化与配音链（主色轮换 / 段序移位 / 中继配音） |
| `tts-gptsovits.py` | 我们自己的 Cotton 声线驱动（替代 edge-tts） |
| `install-git-hooks.mjs` | 把 `core.hooksPath` 指到 `.githooks/` |

### F. 流程：CI、钩子、文档、片子

- **CLI 新命令**：`anim report`（一屏 5 项自检）、`anim shot-cards`、`anim icons`、`anim assets`；
- **CI** `.github/workflows/verify.yml`：语法 / 契约测试 / 镜头分类 / 文档守门（**故意不含渲染类判据** —— CI 上没有成片，塞进去只会变成永远 skipped 的假绿灯）；
- **预提交钩子** `.githooks/pre-commit`：对改到的任务跑 `anim report`；只是被引擎改动顺带扫到的片子只提醒不拦；
- **新文档 4 篇**：`docs/RULES.md`（判例式准则 R/Q/S/C/P 12 条）、`docs/ASSETS.md`（素材库四层）、`docs/SFX.md`（音效接入）、`docs/STYLE-mg15.md`（15 套风格对照 + 「骨」的缺口）；
- **镜头卡 23 张 + 索引**：`docs/shots/<分类>/<名字>.md`，按叙事功能分 9 类（生成物，`anim shot-cards` 重生成）；
- **片子**：`tasks/nekohome-intro-ja`（小糯米主片，日语配音 + 中文字幕）、`tasks/nuomi{,2..15}`（15 支短片，主色/段序/切法各不相同）、`tasks/nekoclicker-intro`，以及 8 个夹具（`_iso-lab` `_cel-lab` `_liquid-lab` `_icon-sheet` `_asset-lab` `_sfx-lab` `_probe-flush` `_icon-templates`）。

## 三、一句话版本

> 上游是一支**能出片的引擎**；我们在它上面加了 **三样它没有的东西**：
> ① **可交互的预览工作台**（scrub / 刻线 / 精确帧差异 / 参数实时调）；
> ② **机器可验证的质量判据**（卡点 / 事件密度 / 底色 / 预览一致性 + 提交钩子 + CI）；
> ③ **可复用的表现层**（4 个新镜头模板、3 个引擎原语、15 套风格包、26 个图标、素材库四层、镜头卡）。
>
> 地基（`gl.js` / `text.js` / `timeline.js` / 采样与合成）**一行没改** —— 所有增量都长在它上面。
