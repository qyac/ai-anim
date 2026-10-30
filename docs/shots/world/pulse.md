# `pulse` · 同心圆：8 圈从最近 8 个拍点扩出去，中心方块跟着低频呼吸，底下是标题与拍数读数。

> 分类：**装置** · 能量 中低

**需要音乐**：task.config.mjs 里配 `audio`，并先跑 `node scripts/anim.mjs analyze <任务>`。它读 `ctx.music` 的 `nearestBeat` / `hit('kick', …)` 与 `f.a` 的包络快照；没有音乐分析结果时画面会黑。标题下面那行副标（`N 拍 · M kick · K snare`）是**从音频分析结果算出来的**（`music.beats` / `music.kicks` / `music.snares` 的长度），不是参数 —— 换音乐它自己会变。读的是段内时间 `f.lt`。

## 什么时候用

强调节拍或周期性（心跳、脉冲、每一拍）

## 什么时候别用

没有音乐的片子；需要精确读数时

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"pulse"` | 段名（--only / HUD / 报错里用它） |
| `title` | string | `"节奏不需要手抄"` | 底部那行标题 |

## 最小示例

```js
export default shot('pulse', { title: "节奏不需要手抄" });
```

## 看效果

```sh
node scripts/anim.mjs shots pulse                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only pulse      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
