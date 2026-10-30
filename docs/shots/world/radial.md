# `radial` · 径向分布：中心一个核（呼吸方块）+ 一圈轮辐，每根辐条带节点、名字（外环背向圆心）与沿辐条的读数条；外圈还有一道慢转的缺口环。

> 分类：**装置** · 能量 中低

背景是自带的整帧 Pass（key `shot_radial_bg`），不需要时间线的 world。`nodes` 与 `weights` **按下标配对**（weights 不够长就循环取）；读数条是示意值，要有出处（docs/FACTS-TEMPLATE.md ★）。节点**均匀分布**（角度 = 起点 - i·360/n，逆时针）—— 要不等距就手写场景。慢转的环是 t 的纯函数；节点位置永远固定，转的只是背景环。

## 什么时候用

讲"几个部分围绕一个中心"：构成 / 多路输入 / 环节闭环

## 什么时候别用

要比高低长短（用 chart / compare）；节点超过 8 个时名字环会互相挤

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"radial"` | 段名（HUD / --only / 报错里用它） |
| `kicker` | string | `"RADIAL / 环形分布"` | 左上眉标 |
| `title` | string | `"围绕一个中心的五条线"` | 顶部居中的主标题（逐字上浮） |
| `nodes` | string[] | `["采集","清洗","建模","校验","发布"]` | 节点名（等角分布在圆上；空数组退回默认五个） |
| `weights` | number[] | `[0.62,0.45,0.88,0.54,0.71]` | 每个节点的读数条长度（0..1，与 nodes 按下标配对；缺省循环取） |
| `footer` | string | `"中心是目标，辐条是各路的进度"` | 底部一行（页脚带里，最后淡入；空串则不画） |

## 最小示例

```js
export default shot('radial', { kicker: "RADIAL / 环形分布", title: "围绕一个中心的五条线", nodes: ["采集","清洗","建模","校验","发布"] });
```

## 看效果

```sh
node scripts/anim.mjs shots radial                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only radial      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
