# `grid` · 频谱网格：每列一个频段（low/mid/high 轮换），按包络高度点亮格子，右侧一道扫描线，左下六条读数。

> 分类：**装置** · 能量 中高

**需要音乐**：task.config.mjs 里配 `audio`，并先跑 `node scripts/anim.mjs analyze <任务>`。它读 `ctx.music` 的包络数组（`rms` / `low` / `mid` / `high`，按 `music.fps` 索引）与 `f.a` / `f.beat`；没有音乐分析结果时画面会黑。⚠ 原文注释写「24×12 的格子」，但代码实际是 `cols = 32`：**32 才是出过片的那个值**，`DEFAULTS.cols` 保持 32（`rows` 才是 12）。读的是段内时间 `f.lt`。

## 什么时候用

展示多路信号/频段的整体形态 —— 看整块，不读单值

## 什么时候别用

要读单个数值时；无音频的任务

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"grid"` | 段名（--only / HUD / 报错里用它） |
| `label` | string | `"AUDIO → GEOMETRY"` | 左上角那行等宽小字 |
| `cols` | number | `32` | 列数 |
| `rows` | number | `12` | 行数 |
| `window` | number | `2.2` | 显示最近多少秒 |

## 最小示例

```js
export default shot('grid', { label: "AUDIO → GEOMETRY", cols: 32, rows: 12 });
```

## 看效果

```sh
node scripts/anim.mjs shots grid                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only grid      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
