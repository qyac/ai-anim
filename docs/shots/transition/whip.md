# `whip` · 甩镜转场：把上一段的成帧（ctx.under）按方向性模糊甩走，叠一层斜向速度线与一道信号色主轴，配径向模糊 + 震屏。

> 分类：**转场** · 能量 高

这是**转场镜头**，时间线里要写 cut(whip, { dur, overlap, handlesTransition: true })，它读 ctx.under（上一段的成帧）来做甩镜。没有 under 时按 k = 1 画普通一帧（画面几乎是黑的 + 速度线），所以单独播这一段（--only whip）看起来是"甩到头"的样子，属正常。dir 是 uv 空间的甩动方向；Pass 构造里那个 [1, 0.15] 是 demo 原文的初始 uniform 默认值，每帧都会被 dir 覆盖，改它没有效果。⚠ 自己声明了 handlesTransition，所以不要再让引擎做交叉溶解（会两屏叠一起）。

## 什么时候用

两段之间要速度感：把上一段的成帧甩走（必须和上一段交叠）

## 什么时候别用

文字多的切点（甩动的字会糊成一片）；不能单独当一段画面

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"whip"` | 段名（HUD / --only / 报错里用它） |
| `streaks` | number | `26` | 斜向速度线的条数 |
| `dir` | [number, number] | `[1,0.12]` | 甩的方向（uv 空间，如 [1, 0.12]） |

## 最小示例

```js
export default shot('whip', { streaks: 26, dir: [1,0.12] });
```

## 看效果

```sh
node scripts/anim.mjs shots whip                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only whip      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
