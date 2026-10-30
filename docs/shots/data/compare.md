# `compare` · 对比镜头：一行一个指标，指标名在左、两条水平条（上 A 灰 / 下 B 信号色）在中、右侧一组读数（A → B），逐行长出来；顶部标题副标、右上图例、底部脚注。

> 分类：**数据** · 能量 中低

rows 里每一项是 { label, a, b }，a/b 是 0..1 的比例（画面上的读数是它的百分比取整）。行数决定行高：默认 4 行时一行约 H*0.125；行数越多越挤，超过 6 行建议拆成两段。⚠ 这是**信息型**镜头：一屏会有 8 块以上的字（标题 + 副标 + 图例 + 每行"标签 + 读数"），超过 docs/LAYOUT.md 那个"一屏 ≤ 6 块"的软上限 —— 版面守门会 warn，那是读数不是错误；要它安静就减行数，或者别把这段塞进"一屏只让观众看一件事"的位置。背景是本模板自带的整帧 Pass（key shot_compare_bg），不需要时间线的 world。

## 什么时候用

2–4 个指标、两组值的对比（前后 / 方案 A vs B）

## 什么时候别用

超过 4 行会挤；只有一组值时用 counter 或 chart

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"compare"` | 段名（HUD / --only / 报错里用它） |
| `title` | string | `"优化前后"` | 左上主标题（逐字入场） |
| `sub` | string | `"COMPARE / 同一批指标，两个版本"` | 标题下的等宽副标（整行淡入） |
| `aTitle` | string | `"优化前"` | A 条（上面那条、灰色）的图例名 |
| `bTitle` | string | `"优化后"` | B 条（下面那条、信号色）的图例名 |
| `rows` | object[] | `[{"label":"单帧耗时","a":0.88,"b":0.34},{"label":"峰值内存","a":0.72,"b":0.46},{"label":"包体积","a":0.61,"b":0.52},{"label":"首屏时间","a":0.8,"b":0.28}]` | 每行一个 { label, a, b }：a / b 都是 0..1 的比例 |
| `icons` | string[] | `[]` | 可选的行业图标（与 rows 同序，名字见 anim icons）；不写就不画 |
| `footer` | string | `"示意数据 —— 换成真实数值之前不要当结论"` | 底部一行（脚注带里，最后淡入；空串则不画） |

## 最小示例

```js
export default shot('compare', { title: "优化前后", sub: "COMPARE / 同一批指标，两个版本", aTitle: "优化前" });
```

## 看效果

```sh
node scripts/anim.mjs shots compare                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only compare      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
