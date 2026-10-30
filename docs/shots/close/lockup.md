# `lockup` · 署名组合（定版）：几何标记（环 / 菱形 / 方块）+ 字标 + 副标 + 从中间展开的分隔线 + 署名行，最后停住不压黑。

> 分类：**收尾** · 能量 低

背景是自带的整帧 Pass（key `shot_lockup_bg`），不需要时间线的 world。与 `outro` 的分工：`outro` 是"片尾动作"（收拢 + 压黑），`lockup` 是"那张定版"（停住、可当封面底）。`mark` 只认 ring / diamond / square —— **写错在工厂里就抛**（不会画出一屏看不懂的东西）。`tagline` 与 `meta` 空串时不画那一行。

## 什么时候用

章末 / 系列片尾 / 短视频最后一屏 —— 标记与字标一起定住

## 什么时候别用

需要"收尾动作"或压黑时（用 outro）；一屏还要讲第三件事时

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"lockup"` | 段名（HUD / --only / 报错里用它） |
| `mark` | string | `"ring"` | 标记形状：'ring' / 'diamond' / 'square'（写错抛错） |
| `kicker` | string | `"LOCKUP / 定版"` | 左上眉标（空串则不画） |
| `name` | string | `"写代码，就是做动画"` | 字标（居中大字，逐字上浮） |
| `tagline` | string | `"CODE-RENDERED MOTION"` | 字标下面那行等宽副标（空串则不画） |
| `meta` | string | `"anim · 确定性渲染 · 任意时刻可重放"` | 分隔线下面的署名行（空串则不画） |
| `footer` | string | `""` | 页脚带里的一行小字（空串则不画） |

## 最小示例

```js
export default shot('lockup', { mark: "ring", kicker: "LOCKUP / 定版", name: "写代码，就是做动画" });
```

## 看效果

```sh
node scripts/anim.mjs shots lockup                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only lockup      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
