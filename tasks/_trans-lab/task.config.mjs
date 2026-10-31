/**
 * 转场模式夹具（BACKLOG 1-13：`wipe` / `iris` / `glitch` / `pixel` / `dissolve`）。
 *
 * 判断标准只有一条：**交叠期看出来"有一个动作在把上一屏换掉"，而不是两屏糊在一起**。
 * 所以这里刻意用**两段内容形状完全不同的画面**（左对齐大字 ↔ 右对齐图表），
 * 溶解那种"两屏叠着"的糊在这个组合下一眼就能认出来。
 *
 * 每个模式两段：A（标题，深色）→ B（图表，浅色），`overlap` 撑到 **1.2 秒** ——
 * 转场自带交叠，0.4s 的短交叠在 still 里根本抓不到中间态。
 *
 * 出图（**必须看交叠期的中间帧**，段起点 + 0.6s 附近）：
 *   node scripts/anim.mjs still _trans-lab -t 4.6,12.6,20.6,28.6 --only wipe,iris,glitch,pixel
 * 短片：node scripts/anim.mjs shot _trans-lab --from 0 --to 40 --samples 4
 * 回归：node tools/test-transition-modes.mjs（模式表 / 校验 / 源码不变性，不需要 GPU）
 *
 * ⚠ `'push'` 与 `'mix'` 也在表里 —— 它们是**对照组**：`push` 是默认值（逐像素不该变），
 *   `mix` 是"两屏叠着"的旧做法，拿来跟 `dissolve` 比"糊不糊"。
 */

/** 每个模式一段 A→B 的配对；段长 4s、交叠 1.2s ⇒ 每对跨 6.8 秒。 */
const MODES = [
  { mode: 'push', a: 'PUSH / 甩镜（默认）', b: '对照组：镜头没停，画面被带走' },
  { mode: 'mix', a: 'MIX / 交叉溶解（旧默认）', b: '对照组：两屏叠在一起' },
  { mode: 'wipe', a: 'WIPE / 擦除', b: '软边横扫 + 前沿暖光' },
  { mode: 'iris', a: 'IRIS / 光圈', b: '正圆张开（按长宽比校正）' },
  { mode: 'glitch', a: 'GLITCH / 故障', b: '切片错位 + RGB 分离' },
  { mode: 'pixel', a: 'PIXEL / 像素块', b: '格子由密到疏、逐格消失' },
  { mode: 'dissolve', a: 'DISSOLVE / 阈值溶解', b: '多尺度噪声吃掉上一屏' },
  { mode: 'none', a: 'NONE / 硬切', b: '对照组：什么都不做' },
];

const timeline = [];
for (const { mode, a, b } of MODES) {
  timeline.push({
    type: 'title', title: a, sub: `transition: '${mode}'`, dur: 4, id: `${mode}-a`,
  });
  timeline.push({
    type: 'chart', values: [0.32, 0.58, 0.46, 0.74, 0.62, 0.9], title: b, dur: 4,
    id: `${mode}-b`, overlap: 1.2, transition: mode,
  });
}

export default {
  title: '转场模式夹具',
  width: 1920, height: 1080, fps: 60,
  style: 'print',
  timeline,
};
