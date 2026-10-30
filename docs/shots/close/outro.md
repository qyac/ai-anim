# `outro` · 片尾：从两侧收拢到中心的细线 + 每 40px 一根的刻度，标题按字放大落位、等宽副标整行淡入，右下角签名带一个闪烁光标，最后 0.6 秒压黑收尾。

> 分类：**收尾** · 能量 低

结尾的淡出用 post 的 fade（在 render 里按段内时间算），不是切黑 —— 所以这段**别写太短**：细线要 t=1.6 才收拢完，副标 t=1.2 才开始淡入，压黑发生在最后 0.6 秒；段长（f.end - f.start）短于约 2 秒就会看到"还没写完就黑了"。signature 只写文字，末尾那个闪烁的光标（█ / 空格，按 Math.floor(t*2) % 2 交替）是代码加的，不要写进参数里。这一段自己铺了整帧背景（gl.clear 到 P.ink），没有别的底。

## 什么时候用

全片收尾：落标题、签名，最后压黑

## 什么时候别用

中段使用；后面还有信息要讲时

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"outro"` | 段名（HUD / --only / 报错里用它） |
| `title` | string | `"代码即素材"` | 主标题（按字放大落位） |
| `sub` | string | `"没有一张图片 · 没有一帧视频素材 · 全部由 GLSL 与几何生成"` | 下划线下面的等宽副标（整行淡入） |
| `signature` | string | `"anim · deterministic renderer"` | 右下角签名（末尾的闪烁光标由代码加，别写进来） |

## 最小示例

```js
export default shot('outro', { title: "代码即素材", sub: "没有一张图片 · 没有一帧视频素材 · 全部由 GLSL 与几何生成", signature: "anim · deterministic renderer" });
```

## 看效果

```sh
node scripts/anim.mjs shots outro                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only outro      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
