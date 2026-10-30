# `device` · 界面窗口：窗口框四条边依次展开 + 标题栏（三个圆点 + 地址）+ 一句标题 + 几行逐行填出来的内容骨架 + 一根闪烁光标。

> 分类：**界面** · 能量 中低

背景是自带的整帧 Pass（key `shot_device_bg`），不需要时间线的 world。**有真截图时就别用它**：真图当纹理画进来更省事也更像（docs/COOKBOOK.md §9）；这个模板是"没有截图时"的默认答案。`rows` 是每行内容的宽度占内容区的比例（0..1），长度决定行数；第一行按"正文"亮度画，其余是骨架。光标闪烁走 `cycle(t)`（确定性），不是逐帧随机。

## 什么时候用

讲"产品 / 界面 / 一次操作"这一层，又没有真截图可用

## 什么时候别用

有真截图 / 录屏时；需要读出界面里的具体文字时（模板只画结构）

## 参数

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | `"device"` | 段名（HUD / --only / 报错里用它） |
| `kicker` | string | `"DEVICE / 界面"` | 左上眉标 |
| `chrome` | string | `"anim.local / preview"` | 标题栏里那行等宽小字（像地址栏 / 文件名） |
| `title` | string | `"一屏只说一件事"` | 窗口里那句标题（h2 级，逐字上浮） |
| `icon` | string | `""` | 可选的应用图标（名字见 anim icons），画在标题栏左侧 |
| `rows` | number[] | `[0.86,0.62,0.74,0.44]` | 每行内容的宽度比例（0..1）；长度 = 行数 |
| `footer` | string | `"窗口是介质，不是主体 —— 主体是那句话"` | 底部一行（页脚带里，最后淡入；空串则不画） |

## 最小示例

```js
export default shot('device', { kicker: "DEVICE / 界面", chrome: "anim.local / preview", title: "一屏只说一件事" });
```

## 看效果

```sh
node scripts/anim.mjs shots device                        # 参数全表（唯一权威）
node scripts/anim.mjs still demo -t 2 --only device      # 出图看
```

<!-- 生成物：改模板 meta 后跑 node tools/gen-shot-cards.mjs，别手改 -->
