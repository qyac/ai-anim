# `bigtype` · 大字主张：两三行 hero 级大字逐字上浮 + 一处关键词换信号色 + 左侧引导线与下划线

> 分类：**主张** · 能量 中

背景是本模板自带的整帧 Pass（key `shot_bigtype_bg`），自己铺满整帧，不需要时间线的 world，也不能和别的模板叠在同一段。`mark` 是**切段画**出来的（前/中/后三段按 measure 推进），不是叠色重画 —— 叠色在动画途中会和骨白混成脏色。行距 = hero × 1.10，字号跟着风格包的语义字号走（docs/STYLE.md §4.1）。

## 什么时候用

一屏一句主张 / 一章的分论点 —— 让观众只读这一句

## 什么时候别用

需要同时给出数据或图时（改用 chart / counter）；一句话超过两行会挤出下划线

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"bigtype"` | 段名（HUD / --only / 报错里用它） |
| `kicker` | string | `"BIG TYPE / 一句主张"` | 左上眉标（等宽小字；落在页眉保留带里，不进版面判据） |
| `line1` | string | `"把复杂的东西"` | 第一行大字 |
| `line2` | string | `"讲成一句话"` | 第二行大字（下划线的宽度按这一行量） |
| `mark` | string | `"一句话"` | 要高亮成信号色的子串（找不到就整行同色；会先在第一行里找，再在第二行里找） |
| `footer` | string | `"一屏只留一个主张 —— 其余交给旁白与字幕"` | 底部一行（页脚带里，最后淡入；空串则不画） |

## 最小示例

```js
export default shot('bigtype', { kicker: "BIG TYPE / 一句主张", line1: "把复杂的东西", line2: "讲成一句话" });
```

## 看效果

```sh
node scripts/anim.mjs shots bigtype                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only bigtype      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
