# `layers` · 分层纸片：几张带透视的梯形纸页从后往前落位，每张有横线与左侧信号色标记，最前面那张上写着标题。

> 分类：**流程** · 能量 中低

背景是自带的整帧 Pass（key `shot_layers_bg`），不需要时间线的 world。`sheets` 是层数（1..6）：越多越密，超过 5 层时最远的几张几乎只剩一条边。纸页是**实心**的（不透明调色），填充用梯形逐行铺（`fillTrap`），不是 `fillRect` —— 线段批的柔边在相邻两条之间会叠加（HANDOFF §11.2）。线段批没有 z-test：叠放顺序就是绘制顺序（从远到近，画家算法）。

## 什么时候用

讲"分层 / 抽象层级 / 叠加的几层" —— 一层一层往回退

## 什么时候别用

需要看清每层内容时（模板只画横线示意）；层数超过 5 层

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"layers"` | 段名（HUD / --only / 报错里用它） |
| `kicker` | string | `"LAYERS / 分层"` | 左上眉标 |
| `sheets` | number | `4` | 层数（1..6） |
| `title` | string | `"一层一层往回退"` | 最前面那张纸上的标题（居中、逐字上浮） |
| `footer` | string | `"每层只回答一个问题 —— 叠起来才是全貌"` | 底部一行（页脚带里，最后淡入；空串则不画） |

## 最小示例

```js
export default shot('layers', { kicker: "LAYERS / 分层", sheets: 4, title: "一层一层往回退" });
```

## 看效果

```sh
node scripts/anim.mjs shots layers                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only layers      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
