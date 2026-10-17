// rhythm —— 静/动分段的标定样本（BACKLOG 1-38）：静 0.5 → burst 1.0 → 静 1.2。
//
// 给「死静帧占比 / 最长静段」这两个判据当**边界样本**：
//   · 0–0.5s   完全静止（一个像素级不动的实心块 + 网格）；
//   · 0.5–1.5s burst：一列方块快速交替闪现（6 拍）；
//   · 1.5–2.7s 再次完全静止 —— **≥1s 的静段**（判据线本身），量具必须量得出来。
// `anim rhythm` 在它身上应量出：静帧占比约 (0.5+0.8)/2.3 ≈ 57%、最长静段 0.8s…——
// 实际上静段含两端按 step 计，粗略 0.5–1.0s 与 1.5–2.0s。
//
// ⚠ **不走 makeShot**：makeShot 的骨架每帧叠 cameraPost（全片正弦浮动），那玩意的
// 每一步位移都会超过帧差阈值，"死静"就永远量不出来。这个场景要的就是**真空静**，
// 所以它是一个裸场景对象：post 不带 cameraPost，也不开 grain（grain 每帧随 t 变化）。
// REFERENCE-onetake.md §3 的 clearing 教训：「rest 必须真空静，1→1.05 的慢推在
// 量具眼里永远不静」—— 这一条在这里是**结构性**的，不是调参。
import { css } from '../../../src/core/util.js';

export default {
  id: 'rhythm',
  handlesTransition: true,          // 自己铺满整帧背景（下面第一句就是 clear）

  render(ctx) {
    const { f, gl, lines, text, type, P, comp } = ctx;
    gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);
    const t = f.lt;
    lines.begin();
    // 静态背景网格（两个静段里它也一笔不动）
    for (let i = 0; i <= 10; i++) {
      lines.seg(160 + i * 176, 200, 160 + i * 176, 920, 1, [P.ash[0], P.ash[1], P.ash[2], 0.22]);
    }
    // burst：0.5–1.5s，6 拍、每拍亮一格（t 的纯函数，无逐帧状态）。
    // 格子中心避开网格线（列 x = 网格线 x + 88，即两线之间），第一版与最左网格线重合被验收点名。
    if (t >= 0.5 && t < 1.5) {
      const beat = Math.floor((t - 0.5) / (1.0 / 6));
      const frac = ((t - 0.5) % (1.0 / 6)) / (1.0 / 6);
      const col = 160 + beat * 176 + 88;
      const a = frac < 0.6 ? 1 : 1 - (frac - 0.6) / 0.4;   // 亮 60%、熄 40%
      lines.fillRect(col - 44, 240, 88, 640, [P.signal[0], P.signal[1], P.signal[2], 0.55 * a]);
      lines.rect(col - 44, 240, 88, 640, 2, [P.signal[0], P.signal[1], P.signal[2], a]);
    }
    // 静段的可见内容（像素级静止 —— 亮度守门不误报，帧差量具量得出"死静"）
    const isHold = t < 0.5 || t >= 1.5;    if (isHold) {
      lines.fillRect(760, 400, 400, 260, [P.bone[0], P.bone[1], P.bone[2], 0.08]);
      lines.rect(760, 400, 400, 260, 2, [P.bone[0], P.bone[1], P.bone[2], 0.5]);
      lines.seg(160, 140, 300, 140, 2, [P.ash[0], P.ash[1], P.ash[2], 0.6]);
      lines.seg(160, 132, 160, 148, 2, [P.ash[0], P.ash[1], P.ash[2], 0.6]);
      lines.seg(300, 132, 300, 148, 2, [P.ash[0], P.ash[1], P.ash[2], 0.6]);
    }
    lines.flush(ctx.out);

    text.clear();
    type.writeLine('HOLD', 1660, 180, { anchor: 'right', size: 26, family: 'mono', color: css(P.ash, isHold ? 0.9 : 0.25) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    // ⚠ 真空静（三件都得关，缺一个"死静"都量不出来）：
    //   · grain 显式归零（DEFAULT_POST.grain = 0.035，返回 {} 合并后它仍在）；
    //   · dither: 'off'（默认 'rpdf'，种子来自帧号 —— 暗部经 linearToSrgb 的 12.92× 斜率
    //     放大后可达 ~6.4/255，帧差量具会把它全判成"动"）；
    //   · 无 cameraPost（相机浮动每步都超阈值）。
    // bloom/vignette 不随帧变化，留着不影响静止判定。
    return { grain: 0, dither: 'off' };
  },
};
