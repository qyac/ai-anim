# `pixel` · 像素风：一张 4–8 色的调色板 + 整块栅格 + Bayer 抖出来的渐变 + 按 12fps 台阶跳的精灵队列；中文标题走引擎文字层，最后与图一起压进同一个栅格。

> 分类：**风格件** · 能量 中低

不需要时间线的 world（整帧由本段自己铺：最深一档 + 抖出来的天空 + 地面 + 边框）。`palette` 见下方参数说明，也可以直接给色表（2–32 色）。**与 `post.pixel` 的区别**：后处理像素化保留原图所有颜色、没有抖动、文字一起糊；这里的四件事（调色板 / 块 / 抖动 / 12fps 台阶）是按像素画的，所以才有"老机器"的味道。中文**不要**用 5x7 像素字（一个汉字要 12x12 以上），所以标题走 `type.write`。

## 什么时候用

讲"这台机器算出来的"：游戏 / 复古 / 低分辨率 / 8-bit / 记忆里的那块屏幕

## 什么时候别用

需要读出精确数值或小字（像素化会吃掉）；要做"印刷品"用风格包的 view: halftone

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"pixel"` | 段名（HUD / --only / 报错里用它） |
| `kicker` | string | `"PIXEL / 像素机"` | 左上眉标（用 5x7 像素字画，建议英文 / 数字） |
| `title` | string | `"像素机"` | 主标题（走引擎文字层，中文可用） |
| `sub` | string | `"四色 · 抖出来的渐变 · 12fps 的台阶"` | 副标题 |
| `footer` | string | `"颜色只有四档 —— 中间那些明暗是抖出来的"` | 底部一行（页脚带里，最后淡入；空串则不画） |
| `palette` | string | string[] | `"gameboy"` | 调色板名（gameboy / nes / amber / pico / bit1）或直接给色表 |
| `cell` | number | `8` | 一个像素格占多少逻辑像素（默认 8；越小越精细、越不像 8-bit） |
| `crawl` | string | `"bot"` | 地面上那串精灵用哪个（bot / coin / heart / star / skull / ghost …） |
| `rows` | number | `6` | 保留参数：精灵队列最多几只（默认 6，实际按画幅自动定） |
| `style` | string | `"auto"` | auto（默认）/ terminal（地平线更高，像终端）/ bitmap（最后不做半格压栅格） |

## 最小示例

```js
export default shot('pixel', { kicker: "PIXEL / 像素机", title: "像素机", sub: "四色 · 抖出来的渐变 · 12fps 的台阶" });
```

## 看效果

```sh
node scripts/anim.mjs shots pixel                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only pixel      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
