## 这个 PR 做了什么

在 `237e985` 之上做了 20 个提交 / 311 个文件 / +56,317 −378 行，分三块，**渲染地基一行没动**
（`gl.js` `text.js` `sampling.js` `trans.js` `timeline.js` 与 17 个老模板原样）。

### 1. 可交互的预览回路（上游没有）

- `npm run dev` 的页面从「播放器」升级为编辑台：**时间轴 scrub + 场景/拍点刻线 + 循环当前段**；
- **精确帧按钮**：按导出同一条路径（多子帧）重渲当前帧，并报与 1 子帧预览的 **MAE / PSNR**；
- **参数面板**：风格包（21 套）、主色、泛光/颗粒/暗角/像素化 —— 数值项即时生效（`engine.livePost`），结构项带参重载；
- 拖动快路径（`render(..., { skipPost: true })`），松手补一次完整渲染；
- agent 接口：`__anim.preview(t)` / `previewRange(t0,t1,n)` / `precise(t)`；`window.__animPalette` 调试出口。

### 2. 机器可验证的质量判据

| 工具 | 判什么 |
|---|---|
| `tools/lint-beat-align.mjs` | 切点对拍子（自己重建拍网格，±30ms） |
| `tools/lint-event-density.mjs` | 每一秒都有东西看（静止 ≤3.5s、稀薄窗口 ≤25%） |
| `tools/test-style-palette.mjs` | 风格底色真的画上去了（角落像素 vs 调色板 + 亮/暗分档） |
| `tools/lint-prog-range.mjs` | `prog(t,a,b)` 里 `b ≤ a`（元素永远不出现） |
| `anim report` | 一屏 5 项自检，给 agent 和人都能看 |

配套：`.githooks/pre-commit`（改到的片子判据红就拦提交，被引擎顺带扫到的只提醒）、
`.github/workflows/verify.yml`（纯 JS 回归 + 文档守门，**故意不含渲染判据** —— CI 没有成片）。

### 3. 可复用的表现层

- **镜头库 20 → 23**：`isometric`（等距体块，画家算法）、`cel`（每 2 帧重描的线条沸腾）、`liquid`（域扭曲 + 涟漪）；
  `compare.icons` / `device.icon` 两个可选参数（不传则完全不画）；
- **引擎原语**：`src/kit/boil.js`（确定性抖动）、`src/kit/liquid.js`（域扭曲）、`src/kit/icons.js`（26 个折线图标）、`src/kit/assets.js`（共享素材加载器）；
- **风格包 6 → 21**：`src/style/mg15.js`；并把「底色」统一成显式的 `P.bg`（原来 `gl.clear` 用 `ink`、`chart` 纸面用 `bone`，换风格会反色）；
- **素材库四层**：程序化 / 内置图标 / 共享位图（`assets/manifest.json`）/ 任务本地；
- **镜头卡 23 张**：`docs/shots/` 按叙事功能分 9 类，`anim shot-cards` 从模板 meta 重生成；
- **音效抓取**：`tools/sfx-fetch.mjs`（SoundDino，含出处/许可记账、限速、每次 5 条）。

## 验证

```sh
node tools/gen-shot-cards.mjs --check      # ✓ 23 个模板 / 9 个分类齐全
node tools/test-style-palette.mjs           # ✓ 15 套 MG 风格底色一致
node tools/lint-beat-align.mjs nekohome-intro-ja     # ✓ 5/5 切点 ±30ms
node tools/lint-event-density.mjs nekohome-intro-ja  # ✓ 稀薄窗口 13%（≤25%）
node scripts/anim.mjs report nekohome-intro-ja       # ✓ 5/5 全绿
```

## 完整改动说明

见 `docs/CHANGES-vs-upstream.md`（含 20 个提交一览表、按目录的增删统计、以及「没动哪些文件」）。

## 说明

- 不改上游接口：`timeline.js` / `tasks.js` / 采样 / 合成路径均未修改，老任务画面逐像素不变；
- 新参数全部默认关闭（不传就不画），因此不会影响已有片子；
- 已知未做：`anim mix` 还没有第三条音效轨（`docs/SFX.md` 里写明了缺口与最小实现）。
