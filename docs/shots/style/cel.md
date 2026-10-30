# `cel` · 逐帧手绘 · 线条沸腾：纸面 + 每 2 帧重描一次的线（圆不圆、线不直）

> 分类：**风格件** · 能量 中低

抖动量来自 hash(帧组, 线号)：确定性、可 seek、可并行子帧；成片在 12fps 的节奏上抖，不是每帧随机跳。

## 什么时候用

手作感 / 角色 / 讲这是画出来的

## 什么时候别用

需要精确读数的图表（抖动的坐标轴会读不准）

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"cel"` | 段名 |
| `kicker` | string | `"CEL / 逐帧手绘"` | 左上眉标 |
| `title` | string | `"手作"` | 手写体标题 |
| `sub` | string | `"每一帧都是重画的"` | 副标 |
| `footer` | string | `"线条每 2 帧重描 —— 抖动来自 hash(帧组, 线号)，不是随机数"` | 底部一行 |
| `amp` | number | `1.8` | 抖动幅度（像素，默认 1.8） |

## 最小示例

```js
export default shot('cel', { kicker: "CEL / 逐帧手绘", title: "手作", sub: "每一帧都是重画的" });
```

## 看效果

```sh
node scripts/anim.mjs shots cel                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only cel      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
