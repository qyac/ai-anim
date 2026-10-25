import { seq, cut } from '../../src/timeline.js';
import token from './scenes/token.js';

// 背景不画任何母题（**不声明 world**）：纯色 + 颗粒 + 暗角（post 走 texture token）。
// 用户 2026-10-25 拍板：**网格直接去掉**（"拍直了还是丑"）—— 背景只许"安静地存在"。

/**
 * 设计 token 的前后对比夹具（BACKLOG 1-46 / 1-47）。
 *
 * 两段**画的是同一份内容**（同一组谐波、同一条和曲线、同一句文案），
 * 只有三样东西不同：**字号阶梯 / 线宽三档 / 入场运动**。
 * 出图：`node scripts/anim.mjs still _token-lab -t 2.6`  → out/_token-lab/ 下两张 PNG。
 */
export default {
  title: '设计 token 前后对比', width: 1920, height: 1080, fps: 60, style: 'print',
  timeline: seq([
    cut(token, { id: 'before', dur: 4, params: { mode: 'before' },
      note: '改造前：标题 24px / 线宽 1px / 匀速入场（= 现存 120 个场景的实测分布）' }),
    cut(token, { id: 'after', dur: 4, params: { mode: 'after' },
      note: '改造后：hero 136 / 线宽 1·2.5·6 / 弹簧 + 错峰' }),
  ]),
};
