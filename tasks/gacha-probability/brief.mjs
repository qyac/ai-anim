// @ts-check
// 42 秒为分镜工作值，录音后依照实测时长重排。画幅和风格用于首轮评审。
export default {
  title: '随机抽卡与十连不中',
  logline: '同样的长期命中率，十连落空的概率可以不同',
  audience: '经历过抽卡连败的中文科普观众',
  duration: 42, width: 1920, height: 1080, fps: 60, captions: true,
  style: {
    name: 'flat',
    signals: ['暖白卡片压在墨黑底上', '橙色只给命中标记和正在比较的读数', '固定坐标与卡位贯穿全片'],
    flipped: ['抽卡落点沿卡位展开', '机制变化直接通过可见的卡池和概率轨表达'],
  },
  world: {
    background: '低亮度横向卡轨和统一的百分比轴底纹',
    camera: '从连败卡列推到单张规则，再退回统一坐标',
    motif: '卡列变成连败计数轴，20% 长期命中率作为共同参照',
  },
  segments: [
    {
      id: 'hook', role: 'hook', at: 0, dur: 5,
      hero: '连续翻空的十张卡',
      metaphor: '一条真实可能出现的结果序列',
      motion: {
        primary: '开场直接扫过已经翻开的卡，首秒翻完末张',
        secondary: '卡角依次盖上空标，贯穿对比的 20% 标记落在卡轨上方',
        ambient: '镜头横移到第十张附近停稳',
      },
      peak: { at: 0.9, what: '第十张也翻空，十个空位同屏' },
      stateDiff: '十个待揭晓的位置成为一条完整的连续未中序列',
      relayTo: '十个卡位的横轨与 20% 共同参照', onscreen: ['长期命中率 20%'], build: 'custom',
    },
    {
      id: 'iid', role: 'data', at: 5, dur: 6,
      hero: '每多空一抽便再乘 0.8 的连败曲线',
      metaphor: '每一抽都用同一段长度的 80% 概率条裁掉前一格',
      motion: {
        primary: '以 iidMissTail 逐卡位描出累乘的曲线',
        secondary: '保留每抽 20% 的同高标记，在第十位落下 10.74% 读数',
        ambient: '镜头沿横轨平移至曲线末端后拉回',
      },
      peak: { at: 4.5, what: '第十点落在 10.74%，与开场十张空卡对齐' },
      stateDiff: '一次连败结果展开为独立抽卡的连败概率',
      relayTo: '带编号的十卡位与连败长度轴', onscreen: ['独立抽卡', '0.8¹⁰ ≈ 10.74%'], build: 'custom',
    },
    {
      id: 'bag', role: 'mechanism', at: 11, dur: 7,
      hero: '装有两张命中卡的两袋各十张卡',
      metaphor: '用可见袋边界展示无放回和跨袋两种窗口',
      motion: {
        primary: '按 Fisher–Yates 样例交换卡位，拉出十张窗口从袋首滑过接缝',
        secondary: '只高亮窗口内的命中标记，另一条括号展示最长跨袋连空 16 次',
        ambient: '镜头从第一袋拉远，露出下一袋及物理接缝',
      },
      peak: { at: 4.8, what: '十张窗口越过袋边界，出现全部未中的合法排列' },
      stateDiff: '同一袋首十抽必含两张命中，跨袋时窗口可以全空',
      relayTo: '逐抽读数的卡轨和重置起点标记', onscreen: ['固定袋', '2 / 10', '跨袋最多 16 连空'], build: 'custom',
    },
    {
      id: 'mechanism', role: 'mechanism', at: 18, dur: 8,
      hero: '未中后逐级升高的条件命中率',
      metaphor: '每一次落空把下一抽指针推高一级，命中把指针拉回第一格',
      motion: {
        primary: '用 prdHitChance 逐级推进至第 18 抽的 100% 后回到首抽',
        secondary: '卡面上的是否命中触发升阶与回落，首抽标出约 5.57%',
        ambient: '镜头沿上升阶梯微推，命中后跟回卡轨',
      },
      peak: { at: 6.0, what: '第 18 抽到达 100% 后翻中，指针回到 N=1' },
      stateDiff: '抽取状态由整袋库存切换为距上次命中的计数',
      relayTo: '卡轨的起点标记和 20% 长期命中率', onscreen: ['线性 PRD', '首抽约 5.57%', '第 18 抽必出'], build: 'custom',
    },
    {
      id: 'compare', role: 'compare', at: 26, dur: 9,
      hero: '三种机制共用同一刻度的对照柱',
      metaphor: '拖动同一个十抽窗口更换起点，柱高按模型更新',
      motion: {
        primary: '从指定起点十连切到随机起点十连，再短停指定起点五连',
        secondary: '按当前口径显示三组读数，20% 参照保持固定',
        ambient: '镜头随起点滑块小幅横移，刻度保持同一比例',
      },
      peak: { at: 4.6, what: '切换到随机起点后，固定袋的 0% 柱长到 2.28%' },
      stateDiff: '同一长期命中率下，切换起点和连败长度分别改变柱高',
      relayTo: '起点滑块和长期命中率刻度', onscreen: ['指定起点', '随机起点', '五连', '十连'], build: 'custom',
    },
    {
      id: 'close', role: 'close', at: 35, dur: 7,
      hero: '同一条十卡轨和可变的长期命中率档位',
      metaphor: '把开场结果放回起点、机制与连败长度三项条件',
      motion: {
        primary: '从 PRD 重置开始取十抽，与独立抽卡同长度比较，扫过 5%、10%、20% 三档',
        secondary: '独立与 PRD 用相同刻度，标出前两档的相对次序',
        ambient: '镜头退回十张空卡的原构图',
      },
      peak: { at: 4.3, what: 'PRD 重置后十连与独立十连的高低关系随长期命中率改变' },
      stateDiff: '开场的一次连败成为有明确机制和起点的概率问题',
      relayTo: '', onscreen: ['PRD 重置后十连', '5%', '10%', '20%'], build: 'custom',
    },
  ],
  antiList: [
    '每组读数旁标记长期命中率、起点和连续抽数',
    '柱高依据概率函数或素材数据，卡牌序列用于举例',
    'Fisher–Yates 只演示排序，固定袋的约束由命中张数和无放回给出',
  ],
};
