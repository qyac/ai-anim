# HANDOFF-R8RG8 —— R8/RG8 回读：把 NV12 出片路径的最后一刀做掉

> **这份文档是自包含的一次性交接**：它假设你（下一个会话）看不到产生它的对话。
> 背景、证据、复现命令、硬约束都在本文里；待办登记在 [`BACKLOG.md`](../BACKLOG.md) **1-7**（已改写）。
> 写于 2026-10-17，前两个提交：`a5c3e41`（carry 第一批）、`97e26c5`（图册 + rhythm 量具）。
>
> **✅ 已执行（2026-10-17 本会话）**：`tools/probe-r8.mjs` 全绿（ANGLE / AMD / D3D11，R8 + RG8，
> 含非 4 对齐宽度）、两个平面都已换、`PACK_ALIGNMENT` 钉 1。验收与实测数字见
> [`PERF.md`](../PERF.md) §5.2 / §5.4a / §5.6。**本文保留为决策记录，不要再按它重做一遍。**

---

## 0. 一句话任务

**把 `readNV12()` 的两个平面从「RGBA 回读再 CPU 紧凑化」改成「R8/RG8 纹理直接按单/双字节回读」**，
回读量 8.3MB+0.83MB → 2.1MB+0.41MB（约 −70%），CPU 紧凑化循环整个删掉。
预估核心改动 **60–80 行**，半天以内；唯一的不确定性是 **ANGLE（Chrome 的 GL 翻译层）
对 R8/RG8 `readPixels` 的支持度**——用一个探针半小时内得到确定答案，不支持就走 feature 回退。

## 1. 背景：为什么是这一刀（账的证据）

出片链路 2026-10 起推 NV12（GPU 上转 BT.709 limited 4:2:0，每帧 3.11MB 走 ws 推给 ffmpeg），
端到端 **12.3 fps ≈ 81ms/帧**（[`PERF.md`](../PERF.md) §5.2/5.4 的实测）。
每帧的大致分解（同上）：

| 环节 | 耗时 | 说明 |
|---|---|---|
| 场景渲染（samples=1 轻） | ~45ms | 4K/重场景另算（`--gpu high` 对填充重段 2.15×，PERF.md §2①） |
| ws 传输 3.11MB | ~28ms | 通道天花板 ~110MB/s，已量死（§5.3） |
| **回读 + NV12 转换 + 紧凑化** | **~6ms** | ← **本刀的目标** |
| ffmpeg（nv12 直接吃） | ~4ms | 不是瓶颈 |

当前实现的浪费（证据行号）：

- [`src/core/gl.js:655`](../../src/core/gl.js#L655)：`ybuf: new Uint8Array(w * h * 4)` —— 注释自己写着
  「readPixels 总是按 RGBA 回读」：**Y 平面（w×h 的单字节内容）按 RGBA 回读了 4 倍体积（8.3MB）**；
- [`src/core/gl.js:668-677`](../../src/core/gl.js#L668-L677)：回读后 CPU 逐像素抽
  `out[o++] = yb[i]`（Y）、`ub[i]/ub[i+1]`（UV）—— 1080p 每帧 ~260 万次循环拷贝；
- UV 平面同理（`uvbuf` 是 `w/2 × h/2 × 4`，实际只用前 2 字节）。

为什么现在才做：NV12 之前传输（72–79ms）远大于回读，优化回读没意义；
NV12 之后传输降到 28ms，**回读+紧凑化成了「渲染之外」最大的可削减项**。
（这是 2026-10-17 对 BACKLOG 1-7 重估的结论：旧②「GPU 编码 8bit 回读」只省 1.2ms 还动基线——**已关闭**；
旧③「PBO」只值 6% 还要引异步时序——**已关闭**。这条 ⓐ 是新排序的第一刀，ⓑ 是 WebCodecs。）

## 2. 改动面（按文件）

### 2.1 `src/core/gl.js` 的 `RT` 类（~8 行）

现状（[gl.js:262-298](../../src/core/gl.js#L262-L298)）：格式写死 `RGBA8/RGBA16F`。
加一个 `opts.format: 'r8' | 'rg8'`（默认 undefined = 现状，零影响）：

```js
const fmt = opts.format;
const internal = float ? g.RGBA16F : (fmt === 'r8' ? g.R8 : fmt === 'rg8' ? g.RG8 : g.RGBA8);
const layout  = fmt === 'r8' ? g.RED : fmt === 'rg8' ? g.RG : g.RGBA;
// type 不变（UNSIGNED_BYTE）
g.texImage2D(g.TEXTURE_2D, 0, internal, this.w, this.h, 0, layout, type, null);
```

⚠ 顺手在这存个 `this.format = fmt ?? null`（回读时要知道按什么 layout 读）。
另外注意：R8/RG8 渲染目标的 framebuffer 完整性可能要求 `COLOR_ATTACHMENT` 的读写掩码
（`drawBuffers`/`colorMask`）匹配——如果 `checkFramebufferStatus` 不过，按报错查 ANGLE 的要求。

### 2.2 `readNV12`（~15 行净变化）

现状（[gl.js:644-679](../../src/core/gl.js#L644-L679)）两个 RT 都是 `float: false`（RGBA8），
回读后紧凑化。改成：

- `st.y` 建 RT 时 `format: 'r8'`；`st.uv` 建 RT 时 `format: 'rg8'`；
- 回读改成：
  ```js
  st.y.bind();
  g.readPixels(0, 0, w, h, g.RED, g.UNSIGNED_BYTE, out.subarray(0, w * h));
  st.uv.bind();
  g.readPixels(0, 0, uw, uh, g.RG, g.UNSIGNED_BYTE, out.subarray(w * h, w * h + uw * uh * 2));
  ```
- **紧凑化循环（:676-677 两行 for）删掉**，`ybuf/uvbuf` 两个中转缓冲删掉；
- **NV12 编码着色器（`NV12_FRAG`，gl.js:217 附近）大概率不用动**——它现在把结果写进 RGBA 的
  各通道；R8 目标只会存下 RED 分量，RG8 存前两分量，与 `fragColor` 的写法兼容
  （不放心就 `fragColor = vec4(y, y, y, 1.0)` / `vec4(u, v, 0, 1.0)` 保持现状，硬件只取对应通道）。

### 2.3 回读缓冲尺寸

`st.buf` 现在就是 `(w*h*3)>>1`——**不用变**，只是它的填充方式从「紧凑化拷贝」变成「readPixels 直接写入」。

## 3. 唯一的风险与它的探针（先做这个，半小时出答案）

**GLES3 表 3.2 允许 R8/RG8 纹理，但 `readPixels(RED/RG, UNSIGNED_BYTE)` 在 ANGLE 上是否被支持，
没有实测过**——这正是 PERF.md §5.6 第 5 条留的「要先确认」。失败的形态可能是：
framebuffer incomplete、readPixels 抛 GL_INVALID_OPERATION、或回读全 0。

**探针 `tools/probe-r8.mjs`（~20 行，照 `tools/probe-nv12.mjs` 的形状写）**：

1. 建一个 R8 RT，渲一个已知图案（比如灰阶渐变）；
2. `readPixels(RED)`，与「同一图案渲进 RGBA8 再取 R 通道」逐字节比；
3. RG8 同理。判据：**完全一致或 ±1**（同 probe-nv12 的口径）；
4. 三种结局：
   - **过** → 直接做 2.1/2.2，跑 §4 的全套验收；
   - **不过** → 在 `readNV12` 门口加一个一次性的能力检测（跑一次探针逻辑缓存布尔值），
     **不支持就走现在的 RGBA 路径**（保留紧凑化代码为回退分支）——这一刀就变成「探测后收益自动启用」；
   - **部分过**（比如 R8 行 RG8 不行）→ 只换 Y 平面（它占 8.3MB 的大头，UV 才 0.83MB）。

⚠ 探针要在**无头 Chrome**里跑（走 `openSession` 那套，和 probe-nv12 一样），
别用 node 直接建 GL 上下文——测的就是 ANGLE 的行为。

## 4. 验收（一条都不能少）

这条路径**渲染/check/hashes 都不走**（只有 `video` 出片走），所以验收必须靠专门的量具：

```sh
# ① 逐字节正确性（唯一硬判据，回归清单里已有）
node tools/probe-nv12.mjs          # GPU 的 NV12 vs CPU 参考实现，判据 ±1 —— 必须全绿

# ② 探针
node tools/probe-r8.mjs            # 新写的，见 §3

# ③ 出片路径实测（帧率前后对比 + 产物验收）
node scripts/anim.mjs video _calib --from 0 --to 12 --samples 1
node scripts/anim.mjs verify _calib          # 8/8 时刻一致（判据 <18）

# ④ 画面清白（理论上不受影响——readNV12 不在渲染路径上，但要证清白）
node scripts/anim.mjs hashes demo --baseline    # 11/11
node scripts/anim.mjs hashes beat --baseline    # 11/11

# ⑤ 回归
node tools/regress-all.mjs --only unit          # 22/22
```

实测数字记进 [`PERF.md`](../PERF.md)：§5.6 第 5 条划掉、§5.2 加一行「R8/RG8 回读之后」的端到端帧率。
预期收益：回读+紧凑化的 ~6ms 砍到 ~2ms，端到端 81 → ~77ms（12.3 → ~13 fps）。
**先 `video --dry-run` 拿预估**，出片前后各跑一次 `_calib` 对比，别拿 promo（太长）。

## 5. 硬约束（违反会浪费你半天）

1. **渲染期间一个文件都别写**（Vite 会崩，`docs/*.md` 也不行——MEMORY 的教训）。
   改完代码先停下所有写入，再跑渲染类命令；并发产出落 `out/_staging/`。
2. **别用 PowerShell 的 Set-Content/Out-File 写文件**（UTF-8 中文必乱码）——只用 read/write/edit 工具。
3. **probe-nv12 是这条路径唯一的正确性判据**——上次 NV12 的「uniform int 静默失效把两个平面渲成亮度面」
   就是靠它抓的。改完不跑它 = 没验证。
4. **不要动 `readPixels(rt, 'srgb')` 那条路**（still/hashes/dump 用它）——本刀只动 `readNV12`。
   两者共享的只有 RT 类，RT 的默认行为必须零变化（`format` 不传 = 与今天逐字节相同）。
5. 验收看图（`still` 出的 PNG）需要带视觉的子代理：`our-free-model` 供应商 +
   `z-ai/glm-5.3-flash`（vision 路由，实测最稳），**一次只给 2-3 张图**，prompt 里写明
   「禁止派孙代理、禁止跑命令」——主会话模型没有图像输入。

## 6. 本轮（onetake 三批）已落地的账，避免重复劳动

| 交付 | 位置 |
|---|---|
| onetake 拆解报告（判据出处） | [`REFERENCE-onetake.md`](../REFERENCE-onetake.md) |
| `anim carry`（连贯度 oracle）+ `cut(..., { carry })` 声明 | `scripts/anim.mjs` cmdCarry / `src/timeline.js` |
| `check` 节奏腿（CoV）+ `anim rhythm`（静/动分段） | 同上 cmdRhythm / `rhythmSegments()` |
| `src/kit/carry.js` 六个纯函数 + 33→37 项单测 | `tools/test-carry.mjs` |
| 图册夹具 `tasks/_carry-lab/`（7 段，看图验收 9/9） | 已挂回归 `check:_carry-lab` |

1.D 里还开着的只剩：**1-37 的后半**（把 `_carry-lab` 的 stills 升级成「六帧+速度曲线」接片图）与
**1-7 ⓑ**（WebCodecs，PERF.md §5.4b 已实测可行未落地）——都比本刀大，且不阻塞本刀。

## 7. 给下一个会话的开场白（直接复制）

> 读 `docs/HANDOFF-R8RG8.md`，做它描述的事：R8/RG8 回读（BACKLOG 1-7 重估后的第一刀）。
> 先跑 §3 的探针拿「能不能做」的答案，再做 §2 的改动，§4 的验收一条别少。
> 硬约束在 §5，别踩。
