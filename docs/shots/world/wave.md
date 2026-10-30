# `wave` · 波形：以当前时刻为右端的历史窗口，逐列查音频包络数组画竖线，kick 事件打横线。

> 分类：**装置** · 能量 中

**需要音乐**：task.config.mjs 里配 `audio`，并先跑 `node scripts/anim.mjs analyze <任务>`。它读 `ctx.music` 的包络数组（`rms` / `low` / `high`，每帧一个值、按 `music.fps` 索引）与 `music.hits('kick', t - 2.2, t)` 的真实打击事件，以及 `music.bpm`。没有音乐分析结果时 `music` 为空、画面会黑。读的是整片时间 `f.t`，不是段内时间。beat 那个任务的段名是 `intro`，所以那边写 `shot('wave', { id: 'intro' })`。

## 什么时候用

讲声音/节奏本身，要让观众"看见拍子"

## 什么时候别用

任务没配 audio（会黑）；旁白为主、音乐很弱的段落

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"wave"` | 段名（--only / HUD / 报错里用它） |
| `label` | string | `"BEAT"` | 左上角那行等宽小字 |
| `cols` | number | `240` | 波形竖线的条数 |
| `window` | number | `1.2` | 显示最近多少秒 |

## 最小示例

```js
export default shot('wave', { label: "BEAT", cols: 240, window: 1.2 });
```

## 看效果

```sh
node scripts/anim.mjs shots wave                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only wave      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
