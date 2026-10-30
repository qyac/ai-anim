# `timeline` · 横向事件轴：轴线从左画到右，笔尖路过的事件节点依次弹出（外圈 + 信号色中心点 + 短刻度），事件名上下交替淡入。

> 分类：**流程** · 能量 中低

背景是自带的整帧 Pass（key `shot_timeline_bg`），不需要时间线的 world。`events` 是一串名字，**等距**铺开（首尾贴轴两端）—— 要表达"不等距的时间"，得给每个节点留出视觉间隔，那不如用 `lineart`（它吃坐标）。节点在笔尖路过 ±40px 内弹出（outBack 回弹），标签随后淡入 —— 段长不足约 3.5 秒会停在半路。与 `lineart` 的分工：`lineart` 画**路径形状**（y 会拐弯），`timeline` 画**顺序**（直轴 + 上下交替的名字）。

## 什么时候用

讲顺序 / 步骤 / 阶段 —— 先做什么后做什么

## 什么时候别用

要表达不等距时间或路径形状（用 lineart）；事件超过 7 个时名字会互相挤

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"timeline"` | 段名（HUD / --only / 报错里用它） |
| `kicker` | string | `"TIMELINE / 事件轴"` | 左上眉标 |
| `title` | string | `"先做什么，后做什么"` | 轴上方的主标题（逐字上浮） |
| `events` | string[] | `["立项","原型","内测","发布"]` | 事件名（等距铺开；空数组退回默认四个） |
| `footer` | string | `"顺序本身就是信息 —— 轴上的每个节点都是一件事"` | 底部一行（页脚带里，最后淡入；空串则不画） |

## 最小示例

```js
export default shot('timeline', { kicker: "TIMELINE / 事件轴", title: "先做什么，后做什么", events: ["立项","原型","内测","发布"] });
```

## 看效果

```sh
node scripts/anim.mjs shots timeline                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only timeline      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
