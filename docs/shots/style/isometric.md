# `isometric` · 等距 2.5D 体块：一格格方块从地面长起来，按 gx+gy+gz 从远到近画（画家算法）

> 分类：**风格件** · 能量 中

刚性几何，纯代码生成。线段批没有 z-test，遮挡只能靠排序；盒子只画朝镜头的 3 个面。

## 什么时候用

讲"长出来 / 搭起来 / 一层层堆"—— 城市、模块、积木、架构

## 什么时候别用

需要真遮挡、材质光照、成百上千实例时（那种用 makeThreeShot）

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"isometric"` | 段名 |
| `kicker` | string | `"ISOMETRIC / 让城市长起来"` | 左上眉标 |
| `title` | string | `"一格一格长出来"` | 主标题 |
| `sub` | string | `"等距 2.5D · 同一个公式画完"` | 副标（等宽） |
| `cols` | number | `7` | 地面格数（x 方向） |
| `rows` | number | `5` | 地面格数（y 方向） |
| `cell` | number | `78` | 单格像素宽 |
| `height` | number | `150` | 体块最大高度（像素） |
| `footer` | string | `"没有 z-buffer：远的先画，只画朝镜头的三个面"` | 底部一行 |

## 最小示例

```js
export default shot('isometric', { kicker: "ISOMETRIC / 让城市长起来", title: "一格一格长出来", sub: "等距 2.5D · 同一个公式画完" });
```

## 看效果

```sh
node scripts/anim.mjs shots isometric                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only isometric      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
