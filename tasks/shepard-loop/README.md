# 谢泼德音阶 · 声音与频谱素材包

**题面建议：为什么声音一直在升高，却永远升不到顶？** 听到的上升感来自多个彼此相差整八度的分量。本包的分量频率在改变，每过一个八度，整组频率和振幅回到同一状态。阶梯版用于离散的谢泼德音阶，滑音版用于谢泼德–里塞连续滑音。 [Shepard 原论文](https://doi.org/10.1121/1.1919362) · [Risset 合成声音目录，第 513 项](https://books.google.com/books?id=oWQ5AQAAIAAJ)

## 文件

| 文件 | 内容 |
| --- | --- |
| `audio/shepard-steps-35s.wav` | 阶梯版，每八度 12 个半音，音符边界有 36 毫秒余弦交叠 |
| `audio/shepard-risset-sweep-35s.wav` | 连续滑音版，各分量平滑向上滑动 |
| `data/sweep-spectrum-60fps.csv` | 连续版一个 7 秒周期的频率和振幅，每秒 60 个时间点，每时刻 8 行，含周期终点 |
| `data/step-spectrum.json` | 阶梯版每个半音稳定段的八度分量。即时过渡层由 `steppedSpectrum(t)` 给出 |
| `data/sync-35s.json` | 35 秒内的分幕时间、八度边界、半音起点和对应相位 |
| `data/waveform-20ms.csv` | 从音频第 1.25 秒起的 20 毫秒波形，包含两个版本的逐样本数据 |
| `svg/frequency-tracks.svg`、`svg/amplitude-envelope.svg`、`svg/waveform-20ms.svg` | 频率轨迹、频谱包络、连续版波形截面。均为透明背景，适合深色画布 |
| `svg/frequency-ruler.svg`、`svg/pitch-strip.svg`、`svg/amplitude-mask.svg` | 可独立合成的标尺、横向条带和垂直透明度遮罩。遮罩以 alpha 通道表示包络 |
| `signal.mjs`、`generate.mjs` | 无第三方依赖的信号函数和素材生成脚本 |

两个 WAV 均为 48 kHz、16-bit PCM、单声道，时长 35 秒，由 5 个 7 秒周期组成。循环时让下一份音频紧接前一份即可，音频对象的零时刻对应素材第 0 秒。音频的 7 秒周期可作为视觉循环参考，35 秒片尾与片头的亮度、布局和转场由合成端接续。

## 关键参数和合成取值

- **频率。** 以 27.5 Hz 为坐标原点。连续版以 (q=j+\operatorname{frac}(t/7)) 表示第 (j) 层的八度位置，频率为 (f=27.5\times 2^q\)。取 `octave / 8` 作为归一化纵坐标，每翻一倍频率移动一个等距刻度。
- **相对振幅。** (A(q)=\sin^4(\pi q/8)\)，范围为 27.5–7040 Hz，峰值在 440 Hz。低频端和高频端都渐隐，可以直接从对应分量的 `amplitude` 读取透明度。图表中标示的是线性合成振幅，声音另乘整体增益 0.28。中频标记可以指示这层合成加权。
- **频率循环。** 每过 7 秒，相邻分量在八度边界换位，进出边界的分量振幅趋零。CSV 的 `band` 是当帧的频率排序，从低到高编号。跨 7 秒边界，直接重新按时间取频率和振幅。
- **声相位。** 连续版每个载波使用相位 (2\pi f(t)\cdot 7/\ln 2\)，对时间求导得到 (2\pi f(t)\)。相同物理频率在换位前后共用相位。阶梯版在相邻半音间做短交叠，保留清晰的阶梯步进。
- **感知示意。** 听觉上升线可用等斜率箭头表达听感。物理量使用多条八度频率轨迹表达，二者各用自己的标注。

```js
import { spec, sweepSpectrum, steppedSpectrum, stepTiming } from './signal.mjs';

const time = 12.4;
const bars = sweepSpectrum(time).map(({ octave, amplitude }) => ({
  yFromBottom: octave / spec.octaves,
  opacity: amplitude,
}));
const steppedBars = steppedSpectrum(time);
const { progress } = stepTiming(time); // 当前半音从 0 到 1 的进度
```

从解压目录运行 `node generate.mjs ./regenerated`，可重新生成 WAV、SVG 和数据。
