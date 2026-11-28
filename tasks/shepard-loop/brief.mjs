// @ts-check
// 音轨、数据和 35 秒分段见任务 README。画幅和风格用于首轮评审。
export default {
  title: '谢泼德音阶与连续滑音',
  logline: '多层音高一起上升，整组声音每七秒回到原样',
  audience: '能通过耳机或扬声器试听的中文科普观众',
  duration: 35, width: 1920, height: 1080, fps: 60, captions: true,
  style: {
    name: 'noir',
    signals: ['深灰背景承载冷白对数标尺', '琥珀色标当前最强分量', '频率与振幅分别对应高度与透明度'],
    flipped: ['先听到上升再展示结构', '用真实频谱数据控制条带'],
  },
  world: {
    background: '固定对数频率刻度，分量始终沿同一纵轴通过',
    camera: '随中段细看后回到首屏构图，开头和结尾同一视位',
    motif: '向上移动的频谱条、固定的亮度包络和七秒时间环',
  },
  segments: [
    {
      id: 'hook', role: 'hook', at: 0, dur: 5,
      hero: '正向上滑的声音与频谱条带',
      metaphor: '音高变化直接映射为频谱条在对数标尺上的高度',
      motion: {
        primary: '首秒先播滑音，条带同步上行，再揭开 27.5–7040 Hz 标尺',
        secondary: '条带按分量振幅变化，中间一层最易辨认',
        ambient: '镜头从首帧全景轻推向标尺和条带',
      },
      peak: { at: 0.9, what: '持续上升的声音和条带上行第一次合拍' },
      stateDiff: '一段上升听感获得同向上升的可见轨道',
      relayTo: '对数标尺和上行条带', onscreen: ['27.5 Hz', '7040 Hz'], build: 'custom',
    },
    {
      id: 'octaves', role: 'mechanism', at: 5, dur: 6,
      hero: '对数标尺两端交接的八度分量',
      metaphor: '高处一层安静退场，低处接着出现一层',
      motion: {
        primary: '用 sweepSpectrum 展示 t=7 秒附近八度层换位',
        secondary: '追踪换位前后频率一致的可听条带，两端趋近透明',
        ambient: '适度拉远镜头，使两个边界同时可见',
      },
      peak: { at: 2, what: '七秒边界到达，最高与最低分量的换位落在近零振幅处' },
      stateDiff: '表面连续上升的图层显出低频补入、高频淡出的交接',
      relayTo: '低频端与高频端的渐隐区', onscreen: ['八度分量', '7 秒'], build: 'custom',
    },
    {
      id: 'mechanism', role: 'mechanism', at: 11, dur: 6,
      hero: '位于 440 Hz 的固定振幅包络峰',
      metaphor: '同一条带经过中段时变亮，向边缘走时变暗',
      motion: {
        primary: '保持频谱上行，取分量 amplitude 让条带通过固定包络',
        secondary: '从最亮条带拉出振幅线，半透明标出包络高点 440 Hz',
        ambient: '镜头略向包络一侧移动，频率刻度保持可比',
      },
      peak: { at: 3, what: '在全片第 14 秒，440 Hz 处的分量达到振幅峰值' },
      stateDiff: '两端淡出的现象获得中段加权的可见成因',
      relayTo: '随时间向上走的多分量轨迹和 440 Hz 标尺', onscreen: ['440 Hz', '振幅包络'], build: 'custom',
    },
    {
      id: 'perception', role: 'compare', at: 17, dur: 6,
      hero: '同一时轴上的分量频率与听感示意',
      metaphor: '物理轨迹周期换位，独立的听感箭头仍持续上行',
      motion: {
        primary: '沿同步时轴推进物理分量和听感示意，跨过全片 21 秒边界',
        secondary: '物理侧按振幅缩亮度，听感侧用不同线型与清晰标签',
        ambient: '镜头横向拉开空间，为第二个图层保留读图间距',
      },
      peak: { at: 4, what: '物理分量在边界换位，听感箭头仍沿原方向上升' },
      stateDiff: '一份上升轨迹拆成物理量与主观示意',
      relayTo: '时间游标和上升方向', onscreen: ['频率分量', '听感示意'], build: 'custom',
    },
    {
      id: 'steps', role: 'compare', at: 23, dur: 6,
      hero: '同一频率轴上的平滑轨迹与半音台阶',
      metaphor: '用 stepTiming 把连续斜线和逐级台阶落到同一节拍',
      motion: {
        primary: '在 t=28 秒的共同周期边界落下新一轮半音台阶',
        secondary: '半音起点跟随 sync-35s，听觉切换对齐已有 WAV 相位',
        ambient: '视位从双图对比缓慢回收至单一标尺',
      },
      peak: { at: 5, what: '连续滑音回到起始频率组，阶梯版开始向本轮第一个半音交叠' },
      stateDiff: '连续滑音的读图转换为可见的离散半音对照',
      relayTo: '周期边界游标和连续频谱轨道', onscreen: ['阶梯版', '连续滑音', '12 半音 / 八度'], build: 'custom',
    },
    {
      id: 'close', role: 'close', at: 29, dur: 6,
      hero: '回到开场视位的上行条带和循环指针',
      metaphor: '让条带和音频跨过接缝继续上升，观众亲自听到循环',
      motion: {
        primary: '继续使用绝对时刻读取频谱，让 t=35 秒与 t=0 的条带同相',
        secondary: '指针进入周期起始线，字幕留出能听清上升音的尾部',
        ambient: '镜头、布局和亮度在最后一个周期返回开场参数',
      },
      peak: { at: 5.7, what: '时间环合拢，随后频谱与声轨跨过边界回到开场相位' },
      stateDiff: '已解释的循环在片尾按原相位再发生一次',
      relayTo: '', onscreen: ['7 秒 / 周期'], build: 'custom',
    },
  ],
  antiList: [
    '听感示意使用独立标注，真实频率由素材计算',
    '7、14、21、28、35 秒始终按同一条绝对时间轴取相位',
    '开场和结尾给演示音保留无旁白空间，核查音画接缝',
  ],
};
