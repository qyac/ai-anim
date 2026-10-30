# `counter` · 计数器镜头：环形刻度盘 + 从正上方扫过的进度弧 + 一个从 from 滚到 to 的大数字（等宽、千分位、固定小数位），下面跟 label、右上跟 unit、底部跟 footer。

> 分类：**数据** · 能量 中

数字在段内 t=0.35 起步、2.3 秒到位（outExpo）；段长不足约 2.6 秒会看到"没滚完就切了"。unit 的位置按**目标值**的宽度预留（slot），所以数字位数变化时 unit 不会左右跳。千分位是手写的正则，刻意不用 toLocaleString（它随 ICU 版本变，会破坏跨机器一致性）。⚠ 这个模板画的是"算出来的数"：写任务时画面上的数字要有出处（docs/FACTS-TEMPLATE.md ★）。背景是本模板自带的整帧 Pass（key shot_counter_bg），不需要时间线的 world。

## 什么时候用

一个数字从 A 滚到 B，让这个读数当画面主角

## 什么时候别用

多个数字并列；数字没有出处（先登记 FACTS.md）

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"counter"` | 段名（HUD / --only / 报错里用它） |
| `from` | number | `0` | 起始值（滚动从这里开始） |
| `to` | number | `96` | 目标值（滚动到这里停住） |
| `decimals` | number | `0` | 小数位数（0..6） |
| `unit` | string | `"fps"` | 单位后缀，画在数字右上（空串则不画） |
| `label` | string | `"单帧渲染吞吐"` | 数字下方的一行说明（空串则不画） |
| `sub` | string | `"COUNTER / 从零滚到目标值"` | 左上眉标（等宽小字、逐字打出；空串则不画） |
| `footer` | string | `"数字是模板的默认值 —— 换成真数据之前不要当结论"` | 底部一行（脚注带里，最后淡入；空串则不画） |

## 最小示例

```js
export default shot('counter', { from: 0, to: 96, decimals: 0 });
```

## 看效果

```sh
node scripts/anim.mjs shots counter                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only counter      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
