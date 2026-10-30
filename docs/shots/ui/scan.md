# `scan` · 扫描格阵：扫描线从左到右，走过的格子按确定性读数填块、扫描线所在列偏信号色，右上角跟一个已扫百分比。

> 分类：**界面** · 能量 中

不读音乐（与 grid 的分工：grid 的亮度来自音频包络，scan 的来自 hash2 的确定性读数）。背景是自带的整帧 Pass（key `shot_scan_bg`），不需要时间线的 world。扫描只走一次（t=0.5 → 4.0 秒，inOutCubic），段长不足 4 秒会停在半路 —— 那也算"没扫完"，不是 bug。读数百分比是**这一段自己的进度**，不是外部数据的统计值。

## 什么时候用

把"逐格读取 / 覆盖 / 推进"这件事可视化 —— 一格一格来，看得见进度

## 什么时候别用

要读出具体数值（改用 counter / chart）；格数超过 40×20 时填充批次会变贵

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"scan"` | 段名（HUD / --only / 报错里用它） |
| `kicker` | string | `"SCAN / 顺序读取"` | 左上眉标 |
| `label` | string | `"已扫"` | 右上读数的前缀（后面跟已扫百分比） |
| `cols` | number | `26` | 列数（6..64） |
| `rows` | number | `12` | 行数（3..40） |
| `footer` | string | `"扫描 = 一次有序的读取 · 走过的格子留在原地"` | 底部一行（页脚带里，最后淡入；空串则不画） |

## 最小示例

```js
export default shot('scan', { kicker: "SCAN / 顺序读取", label: "已扫", cols: 26 });
```

## 看效果

```sh
node scripts/anim.mjs shots scan                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only scan      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
