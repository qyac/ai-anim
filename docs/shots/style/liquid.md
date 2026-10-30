# `liquid` · 液体动态：域扭曲 fbm 流体底 + 一圈圈落下的液滴涟漪

> 分类：**风格件** · 能量 中

底用引擎原语 src/kit/liquid.js；涟漪是 ripple(t - birth) 的同心圆，不是粒子系统，全程 t 的纯函数。

## 什么时候用

一滴/一次触碰引发的扩散；抽象的品牌收尾

## 什么时候别用

需要看清单根线条的图（域扭曲会把细节搅糊）

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"liquid"` | 段名 |
| `kicker` | string | `"LIQUID / 一滴就够了"` | 左上眉标 |
| `title` | string | `"一滴就够了"` | 主标题 |
| `sub` | string | `"域扭曲的流体底 · 同心圆涟漪"` | 副标 |
| `drops` | number | `3` | 液滴数（1..4） |
| `footer` | string | `"底是 fbm 域扭曲；涟漪是 ripple(t - birth) —— 全程 t 的纯函数"` | 底部一行 |

## 最小示例

```js
export default shot('liquid', { kicker: "LIQUID / 一滴就够了", title: "一滴就够了", sub: "域扭曲的流体底 · 同心圆涟漪" });
```

## 看效果

```sh
node scripts/anim.mjs shots liquid                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only liquid      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
