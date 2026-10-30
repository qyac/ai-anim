# `kinetic` · 动态大字 + GLSL 背景：两行主标（逐字上浮、字距随时间收紧）、逐字擦出的等宽副标、左下角滚动的计数器阵列、四角张开的取景框线。

> 分类：**开场** · 能量 高

headline 必须正好两个元素（两行大字；第 2 行的入场比第 1 行晚 0.35 秒，多给或少给都会画错）。左下角的计数器阵列是 cellCols × cellRows 个三位数字在滚，每个格子占 26×26 逻辑像素、从 (60,60) 起算 —— 所以 cellCols/cellRows 调大就会铺满整个下半屏。每个格子的相位来自 cellSeed 的确定性随机（绝不要换成 Math.random）。

## 什么时候用

一句短结论要砸出来（每行 ≤6 字），当全片最响的一拍

## 什么时候别用

长句、需要读懂的信息；它吃满整屏，不能和别的模板叠在同一段

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"kinetic"` | 段名（HUD / --only / 报错里用它） |
| `headline` | string[2] | `["每一帧","都是时间的函数"]` | 两行大字，正好两个元素 |
| `sub` | string | `"DETERMINISTIC / SEEKABLE / RE-RENDERABLE"` | 副标（等宽、逐字擦出来；擦出的进度按这个字符串的长度算） |
| `cellCols` | number | `8` | 左下角计数器阵列的列数 |
| `cellRows` | number | `5` | 左下角计数器阵列的行数 |
| `cellSeed` | number | `31` | 计数器阵列的确定性随机种子 |

## 最小示例

```js
export default shot('kinetic', { headline: ["每一帧","都是时间的函数"], sub: "DETERMINISTIC / SEEKABLE / RE-RENDERABLE", cellCols: 8 });
```

## 看效果

```sh
node scripts/anim.mjs shots kinetic                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only kinetic      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
