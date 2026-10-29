# 素材库怎么扩（`docs/ASSETS.md`）

> 引擎的默认立场是**不需要素材**：画面由代码算出来。素材只在「真东西比手画更像」时才进来 ——
> 真 logo、真截图、真人头像、真纹理。所以扩素材库不是「多存点图」，而是**分四层，各有各的规矩**。

## 四层，从零素材到真素材

| 层 | 是什么 | 现在有没有 | 什么时候用 |
|---|---|---|---|
| **0 程序化** | 网格、颗粒、纸纹、流体、体块 —— shader 与几何算出来 | ✅ 已有（`worldPass`、`liquidPass`、`isometric`…） | 默认。它零体积、零 IO、天然确定性 |
| **1 内置矢量图标** | 折线定义的图标集（24×24），画进 `lines` 批 | ✅ **本次新增** `src/kit/icons.js` | 需要箭头/勾/叉/猫/铃铛这类**小符号** |
| **2 共享位图素材** | 跨任务复用的真图（logo、纹理、产品截图） | ⏳ 未建（见下） | 真东西必须出现时 |
| **3 任务本地素材** | 只属于这一支的图（头像、单支片子的立绘） | ✅ 已有 `tasks/<任务>/assets/` | 素材跟片子走，不进共享库 |

## 层 1：内置图标（已落地）

```js
import { drawIcon, ICON_NAMES } from '../kit/icons.js';
drawIcon(lines, 'cat', 120, 200, 48, css(P.bone));   // x,y = 方格左上角；size = 边长
```

26 个图标：`arrow-right` `arrow-up` `chevron-right` `cursor` `check` `cross` `plus` `minus` `dot`
`alert` `cat` `heart` `star` `sparkle` `bell` `box` `gear` `sun` `moon` `clock` `wave` `chart`
`layers` `terminal` `grid` `pin`。总览：`node scripts/anim.mjs still _icon-sheet -t 1`。

**为什么用折线而不是 SVG 文件**：① 确定性 —— 折线是常数，进 `lines` 批后与其它矢量同批提交，
不涉及 IO、不影响首帧；② 颜色/粗细是参数，跟调色板走；③ 零素材，不用管字体与许可文件。

**加一个图标**：在 `ICONS` 里加一行折线（24×24 坐标，y 向下），然后跑一次 `_icon-sheet` 看它好不好认。
经验：小于 40px 时**细节会消失**（`cat` 少了胡须会被读成心形、单点 `dot` 直接看不见）——
图标要按「最小可辨识尺寸」设计，不是按 24×24 全尺寸设计。

## 层 2：共享位图素材（下一步，规矩先定）

```
assets/
  manifest.json          # 唯一索引：id → 文件 / 类型 / 许可 / 来源
  logos/nekohome.png
  textures/paper-grain.jpg
```

`manifest.json` 每条**必须**有这四个字段（缺一个就加载失败，不是警告）：

```json
{ "id": "nekohome-logo", "path": "logos/nekohome.png", "kind": "logo",
  "license": "自有素材", "source": "用户提供 2026-10" }
```

加载器（`src/kit/assets.js`，待写）遵守三条与引擎一致的原则：

1. **只能在 `setup()` 里加载**（可以 `async setup`）—— `render(t)` 是纯函数，里面不许有 IO；
2. **失败要画占位，不许崩**：缺图 → 画一个带 id 的虚线框，`ctx.warnings` 记一条；
3. **同 id 只加载一次**（进程内缓存），并且**不做网络请求** —— 素材必须已经在仓库里。

渲染期间不能写仓库（HMR 会断流）：新素材先落 `out/_staging/`，渲完再搬进来。

```js
import { loadAsset, drawAsset } from '../kit/assets.js';
async setup(ctx) { this.logo = await loadAsset(ctx, 'nekohome-logo'); }      // 只能在 setup
render(ctx) { drawAsset(ctx, this.logo, [x, y, w, h], { opacity: 0.96 }); }  // 等比铺满，不拉伸
```

素材缺失时 `drawAsset` 画**虚线框 + 交叉线**并把原因 push 进 `ctx.warnings` —— 缺图不崩、不静默。
校验：`node scripts/anim.mjs assets`（四个字段 + 文件存在 + id 不重复，红了退出码 1）。
端到端样张：`tasks/_asset-lab`（真 logo 正常画出；故意缺 id → 占位框 + warnings: 1）。

## 层 3：任务本地素材（已有）

`tasks/<任务>/assets/` —— 已经在用（12 个群成员头像、logo、二维码）。规矩一样：
`setup` 里加载、缺图给占位。区别只是**不进共享库**：它只服务这一支片子。

## 什么时候**不该**加素材

| 想加的东西 | 更好的做法 |
|---|---|
| 网格、纸纹、颗粒 | 别存图 —— `worldPass` / `paper` 风格 / `grain` 参数已经有了 |
| 箭头、勾、叉、播放键 | 用层 1 的图标 |
| 图标要动 | 用 `drawIcon` 画进 `lines`，然后按 `f.t` 逐段画出来（图标是矢量，能一笔笔画） |
| 大段文字配图 | 先问「这句话能不能用代码表达」—— 能就别加图 |

## 一句话

**层 0 是默认，层 1 是快捷键，层 2 是例外，层 3 是个例。** 每往上一层，就多一份体积、
一份 IO、一份许可责任 —— 所以每一层都只在前一层做不到时才用。
