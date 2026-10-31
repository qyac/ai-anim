# `handwrite` · 手写讲解：白板/纸上，一笔一笔按弧长生长出来（落笔细、行笔粗、收笔细），每 2 帧重描一次，标题用手写体压上来。

> 分类：**风格件** · 能量 中低

几何层在 src/kit/stroke.js（中心线 + 压力 -> 轮廓多边形 + 圆头，走 fillPoly）。与 `cel` 的差别是**宽度沿弧长变化**：cel 只有抖动、没有笔压；与 `lineart` 的差别是它讲「写」而不是讲「顺序」。`mode: paper` 换成笔记本（暖纸 + 横格线 + 左边红边线）；`boil` 是重描抖动幅度（0 = 一笔画完）。中文标题用手写体栈（楷体优先；FAMILIES 里没有的名字会原样当 CSS 字体栈用）。

## 什么时候用

白板讲解 / 纸感手写笔记 / 「这件事是一笔一笔写出来的」

## 什么时候别用

要读精确读数或大段正文时（手写体与笔压会吃掉小字）；要「印刷品」用风格包的 view

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"handwrite"` | 段名（HUD / --only / 报错里用它） |
| `kicker` | string | `"HANDWRITE / 白板讲解"` | 左上眉标（等宽小字） |
| `title` | string | `"一笔一笔写"` | 主标题（手写体栈，中文可用） |
| `sub` | string | `"落笔细 · 行笔粗 · 收笔细"` | 标题右侧的副标（手写体小字） |
| `footer` | string | `"笔压是宽度沿弧长的包络 —— 不是给折线加个抖动"` | 底部一行（页脚带里，最后淡入；空串则不画） |
| `mode` | string | `"whiteboard"` | whiteboard（默认，冷白板）/ paper（暖纸 + 横格线） |
| `seed` | number | `3` | 笔迹噪声 / 抖动的种子（同一个 seed 画面逐像素相同） |
| `boil` | number | `1.4` | 重描抖动幅度（逻辑像素；默认 1.4，0 = 一笔画完不抖） |

## 最小示例

```js
export default shot('handwrite', { kicker: "HANDWRITE / 白板讲解", title: "一笔一笔写", sub: "落笔细 · 行笔粗 · 收笔细" });
```

## 看效果

```sh
node scripts/anim.mjs shots handwrite                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only handwrite      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
