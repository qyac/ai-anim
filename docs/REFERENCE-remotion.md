# REFERENCE —— Remotion 与另外三个视频 Skill（2026-10-26 收到的一批）

> 用户给了四个地址，问「有没有能用的」。本文是逐条处置结论 + 唯一值得细看的那一个（Remotion）的对照拆解。
>
> **许可证纪律（与仓库里其它 REFERENCE 一致）**：只读公开文档与仓库结构，**不抄代码、不抄素材、不抄文案**；
> 落地的只能是「思路 + 判据 + 数值口径」，并且要用我们自己的 JS/GLSL 重写。

---

## 0. 结论先行（四个链接的处置）

| # | 地址 | 它是什么 | 处置 | 理由 |
|---|---|---|---|---|
| 1 | `remotion-dev/remotion` | React 写视频、逐帧渲染的**框架**（与本项目同构） | **参考，不安装** | 它是「另一套实现」，装进来只能二选一；值得抄的是它的**输入 schema / 机器可读清单**这两件事（§2） |
| 2 | HyperFrames（Codex 插件市场） | agent 技能包：把「画面语义 lint」做成产品 | **已在用** | `docs/REFERENCE-hyperframes.md` 已拆过，`src/kit/motion.js`（1-27）就是从它来的；剩余待办是 **1-33**（三条运动上限还没接进 `check`） |
| 3 | `browser-use/video-use` | 26KB 的 `SKILL.md` + 6 个 ffmpeg 脚本（MIT） | **已吸收** | `docs/REFERENCE-video-use.md` 已拆过；它最值钱的一条（给 `anim sheet` 叠音频通道）已由 `tools/sheet-audio.mjs` 落地 |
| 4 | `songguoxs/seedance-prompt-skill` | **提示词生成器**：给字节即梦 Seedance 2.0 写中文视频提示词（无代码） | **不装** | 本项目明确**不用生成模型**（画面由 WebGL/Canvas 算出来）；它是给生成模型写词的技能。若哪天做 AI 片头素材，它才对口 |

一句话：**四选一里没有装一个就变强的**。两个已经吃过了，一个不对口，一个是平行宇宙的另一套引擎。

---

## 1. Remotion 是怎么做同一件事的（结构性对照）

Remotion 的定位与本项目**完全同构**：给一个帧号 + 一块画布，你画任何东西；
然后无头 Chrome 逐帧拍、ffmpeg 编。差别只在画布上画什么、以及怎么组织片子。

| 维度 | Remotion | 本项目（anim） |
|---|---|---|
| 画面来源 | React 组件 + CSS/SVG/Canvas/WebGL 混着来 | **GLSL + Canvas2D + 线段批**，没有 DOM |
| 每帧的抽象 | `useCurrentFrame()` 给帧号，其余靠 React 渲染 | `render(ctx)` 拿 `f.t` / `f.lt`，画进 `ctx.out` |
| 确定性 | 文档要求不用墙钟/随机（靠 lint 提醒） | **铁律**：不用 `Math.random` / 逐帧累积，`check` 会扫（AGENTS §4） |
| 组织单位 | `<Composition id fps width height durationInFrames>` | 任务 = `task.config.mjs` 的 `timeline`；段 = 场景/模板 |
| 渲染入口 | `renderMedia / renderFrames / renderStill / stitchFramesToVideo` | `anim video / shot / still`（+ `--segments` 块级增量） |
| 参数化 | Zod schema + Studio 里改 props | 模板 `defaults/meta/spec`（镜头级）+ **`variants`（2026-10-26 起）** |
| 预览 | `<Player>`（可嵌网页）、`remotion studio`（时间轴擦洗） | `npm run dev`（空格播放、[ ] 换段），只给自己用 |
| 交付形态 | 库 + 云渲染（Lambda/CloudRun）+ 商业授权 | 单仓脚本，mp4，**一个人用**（HANDOFF-directions 定的） |

**许可**（决定能不能装）：Remotion 对**个人与 3 人以下公司免费**，4 人以上要 Company License；
自动化渲染产品另有一档按次计费（`remotion.pro/license`）。单人内容工厂在免费档内 —— **许可不是障碍，架构才是**。

---

## 2. 值得抄的三件事（按性价比排序）

### ① 把「有哪些片子 + 每片的输入」变成机器可读的清单 —— 便宜、立刻有用

Remotion 有 `getCompositions()` / `selectComposition()`：**列出所有 composition 及其 fps / 尺寸 / 时长 / props schema**，
渲染前先按 id 选一个。我们对应的是 `anim tasks`，但它只打「名字 + 场景数 + 音乐」，**机器读不到尺寸/时长/风格**。

- **我们缺什么**：任何批量跑一批片子的东西（`anim queue`、睡前渲几支、变体矩阵）现在都要人敲任务名；
  没有一处能回答「哪些是竖屏」「哪些有旁白」「哪个变体存在」。
- **改哪**：`cmdTasks` 长出 `--json`（id / width / height / fps / duration / style / captions / variants / scenes），
  复用已有的 `__anim.info()` 元信息，不新写渲染路径。
- **代价**：约半天。**值**：`queue` / 变体矩阵 / 外部脚本都要它。

### ② 参数 schema 从默认值升级到可校验的声明 —— 我们已经做了一半

Remotion 用 Zod：参数有类型、有默认值、有校验，UI 与渲染共用同一份声明。
我们的镜头模板有 `defaults` + `meta.params` + `spec.params`，**已经是同一份额度**（且 `test-shots` 断言三者一致）；
缺的是**任务级**：`task.config.mjs` 没有 schema —— `variants` 里写错一个**键**（比如 `stlye: 'noir'`）**不会报错**，
会静默地用原配置渲染（今天加变体时就踩过：错拼的**变体名**会抛，但错拼的**键**不会）。

- **改哪**：给任务加可选的 `export const schema = {…}`（或复用模板的 `spec` 词表），`loadTask` 对已知键做白名单校验；
  未知键**警告而不是抛错** —— 任务配置里允许自由字段（`note` 等）。
- **代价**：半天。**值**：中 —— 它挡的是「改了配置但没生效」这类最难查的错。

### ③ 帧区间 + 断点续渲的对外形状 —— 我们已有内核，缺一层标准说法

Remotion 的渲染 API 以**帧区间**为一等公民（`frameRange`），我们的 `video --segments` 是**按时间分块**。
两者能力等价，但对外接口不同：外部脚本想只渲第 100–200 帧时，我们得自己换算成秒、还要小心 fps。

- **值**：低（单人使用，换算一次就够）。**建议**：不专门做；将来接外部调度器再说。

---

## 3. 明确**不要**抄的

1. **不要引进 React / DOM 渲染**。我们的确定性靠「每帧是 t 的纯函数 + 无 DOM 依赖」，DOM 会把布局、字体、滚动条、
   合成器时序全拉进来 —— 那是另一个引擎的取舍，不是我们的。
2. **不要装它的渲染管线**。`renderMedia` 内部也是起 Chrome 逐帧拍 + ffmpeg，我们这套已带
   **块级增量重渲（1-45）/ NV12 传输 / ffprobe 复核产物**，换掉只有损失。
3. **不抄云渲染（Lambda / CloudRun）与授权体系**。单人内容工厂不需要；`HANDOFF-directions` 已把
   分发层（MCP / Agent Skills / 商业化）整体砍掉。
4. **不抄 `<Player>` 完整播放器**。我们的预览是给自己看进度，不是产品功能。

---

## 4. 与其它几份 REFERENCE 的关系（避免重复劳动）

| 文档 | 已经拿走的东西 | 还开着的 |
|---|---|---|
| `REFERENCE-video-use.md` | 自检纪律（最多 3 轮）、把验收做成断言、`sheet-audio` 音频通道 | — |
| `REFERENCE-hyperframes.md` | 运动规则三件套（`src/kit/motion.js`，1-27）、lint 规则集当产品 | **1-33**：三条运动上限接进 `check` 的静态扫描 |
| `REFERENCE-hypit.md` | Source/Run 分离 + 显式复用 Output → 催生了 1-23 的两半 | 1-23 的第三块（`narration.json` 指向另一份表） |
| `REFERENCE-onetake.md` | carry 判据（1-34 / 1-36） | — |
| 本文 | 上面 §2 的三条 | 新增 **1-58**（`anim tasks --json`） |

---

## 5. 一句话

**没有装一个就能用的**：两个已经在这个仓库落地过，一个（Seedance 提示词）与「不用生成模型」的定位正面冲突，
一个（Remotion）是平行实现 —— 它唯一还值得拿的是「把片子清单与输入声明成机器可读的」这一条，已登记为 1-58。
