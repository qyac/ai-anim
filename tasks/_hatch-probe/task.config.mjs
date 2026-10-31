/**
 * **排线的隔离探针**（BACKLOG 1-68 的配套）：
 *
 * 三块**纯平**的灰，明度分别落在三档排线的门槛里（dark ≈ 0.38 / 0.58 / 0.84）。
 * 这张图只回答一个问题：**同一块灰面内部的排线均匀吗？**
 *
 * 为什么需要它：真夹具（`_hatch-lab`）里有渐变、圆、文字，任何不均匀都能被
 * "画面本来就复杂"解释掉。把底图换成三块纯色之后，剩下的一切不均匀都只能是
 * 排线自己的问题 —— 这一轮的 ④（采样半径 < 底图行距 ⇒ 明暗发丝）与
 * ⑤（线距与像素栅格次谐波 ⇒ 宽横带）**都是靠这张图定位的**。
 *
 *   node scripts/anim.mjs still _hatch-probe -t 1
 *
 * ⚠ 判据是"看"：三块各自应当**内部均匀**、从左到右线条数量递增（1 道 → 2 道 → 3 道）。
 *   把它改成 cell: 12 就能复现 ⑤ 的次谐波横带（那是刻意保留的反例）。
 */
import { seq, cut } from '../../src/timeline.js';
import flat from './scenes/flat.js';

export default {
  title: 'hatch-probe（排线均匀性探针）',
  width: 1920, height: 1080, fps: 60, scale: 1,
  // ⚠ cell 必须 ≥ 22（见 src/kit/views.js 的 WOODCUT_MIN_CELL）：12 会出次谐波横带
  style: { name: 'flat', view: { mode: 'woodcut', cell: 24 } },
  timeline: seq([cut(flat, { dur: 2, id: 'bands', world: false, focus: 'center' })]),
};
