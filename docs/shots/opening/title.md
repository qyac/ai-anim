# `title` · 大标题入场：眉标逐字打出 + 主标题逐字上浮 + 一条生长的横线与刻度

> 分类：**开场** · 能量 低

背景是本模板自带的整帧 Pass（key `demo_title_bg`），所以它自己铺满整帧，既不需要时间线的 world，也不能和别的模板叠在同一段。readout: false 时不画右下角读数。blur: 18 左右是"从虚焦里浮出来"（外部配方的默认标题解）；0 = 不碰 Canvas2D 的 filter。

## 什么时候用

全片第一镜或一章的开头：先让观众读到一句主标题

## 什么时候别用

正文段落、或同屏还要读别的信息时；一支片里连用两次像回了片头

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"title"` | 段名（出现在 HUD、--only、报错里） |
| `eyebrow` | string | `"ANIM / CODE-RENDERED MOTION"` | 左上眉标（等宽小字，逐字打出；长度决定打字时长） |
| `title` | string | `"写代码，就是做动画"` | 主标题（逐字上浮入场） |
| `sub` | string | `"deterministic · seekable · motion-blurred by averaging sub-frames"` | 副标题（等主标题基本进场后淡入） |
| `readout` | boolean | `true` | 是否画右下角随时间走的百分比读数 |
| `blur` | number | `0` | 主标题入场的虚焦量（px）：字从 blur 收到 0，与上浮共用缓动；0 = 不糊 |

## 最小示例

```js
export default shot('title', { eyebrow: "ANIM / CODE-RENDERED MOTION", title: "写代码，就是做动画", sub: "deterministic · seekable · motion-blurred by averaging sub-frames" });
```

## 看效果

```sh
node scripts/anim.mjs shots title                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only title      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
