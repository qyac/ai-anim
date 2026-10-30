# 音效（SFX）：从 SoundDino 取，按出处记账

> 这一层之前完全没有 —— 我们只有**人声 + BGM** 两条轨。音效是「画面动作的听觉标点」，
> 缺了它，再好的转场也只是「幻灯片翻页」。

## 一、站点事实（2026-10 实测，别凭印象改）

| 项 | 实测结果 |
|---|---|
| 分类页 | `https://sounddino.com/en/effects/<slug>/`（`<slug>` 如 `whoosh-transition`） |
| 曲目数据 | 每个 `<li class="playtrack">` 带 `data-id` / `data-duration` / `data-track="/mp3/xx/soundNN.mp3"` |
| 音频地址 | 同域静态文件，**直链可下**（实测 18–52 KB / 0.2–3.2s） |
| 单页容量 | 一个分类页一次能解析出 **200+ 条**（whoosh-transition 实测 243 条） |
| 授权 | 首页 FAQ：免费、**可商用**、**无需署名**、可直接下 MP3 |
| 配额 | 页脚匿名配额「Downloads left today **Sounds 5/5** · Music 5/5」 |
| 反爬 | 没有验证码，但**别并发轰炸**；直链也可能被限速 |

**两条纪律**（写进 `docs/RULES.md` 的 S3）：

1. **每次最多 5 条**（工具默认 `--max 5`），间隔 800ms —— 不顶站点配额、不做并发下载；
2. **每条都要记出处与许可**（manifest 里 id / source / license）—— 以后要换站、要商用、要发平台，
   没有这张账就得一条条回查。

## 二、用法

```sh
node tools/sfx-fetch.mjs --list --category whoosh-transition      # 先看目录（不下载）
node tools/sfx-fetch.mjs --pick 1,3,6 --category whoosh-transition --out tasks/<任务>/audio/sfx
node tools/sfx-fetch.mjs --get 3525,3515 --out tasks/<任务>/audio/sfx   # 按 id 精确取
```

产出：

```
tasks/<任务>/audio/sfx/
  whoosh-transition__3515__The-sound-of-the-wind-for-the-transition.mp3
  sfx.manifest.json        # 唯一索引：id / title / group / durationSec / bytes / sha1 / source / license
```

## 三、两个坑（实测）

- **页面上的 `data-duration` 是取整的**（0.21s 的素材标成 1s）→ 工具用**纯 JS 数 mp3 帧**算真实时长；
  沙箱里 node 不能 spawn `ffprobe`，这条是必须的（误差约 ±0.05s）。
- **时长以 mix 时的 ffprobe 为准**：manifest 里的值只用于「挑素材」，不用于对齐；
  对齐时按秒数落点 + 用 `afade`/`adelay` 精确摆位。

## 四、还没做的（下一步）

1. **`anim mix` 支持第三条轨**：现在只有 music + vo。要加 `audio.sfx: [{ file, at, gain }]`，
   走 `amix` + 每个音效 `adelay`；同一时刻多音效要按 gain 相加而不是整体压限；
2. **候选清单**：`anim sfx <任务> --list` 读 manifest 打印「已有哪些类别 / 时长分布」，避免重复下载；
3. **与卡点对齐**：音效落点应当吸附到 `music.nearestBeat(t)` 或动作的 `prog` 结束点。

## 五、为什么不用别的站

- Freesound：质量高但要 OAuth + 下载计数严格，脚本化成本高；
- 各类「免费音效包」：许可条款参差，**没有 manifest 就没法商用记账**；
- SoundDino 的取舍：授权清晰（可商用 / 无需署名）、直链稳定、单页可枚举 —— 适合脚本化。
  代价是**配额小**（5/天），所以我们走「少量多次 + 记 id」，而不是一次抓一仓库。
