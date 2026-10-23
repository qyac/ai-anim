// 验证片 · 第 5 段「收尾」—— 回到第一帧，让片子成环。
//
// pdoom 的 outro 是**把开场场景倒放**并停在 `tau = 0`（`outro.ts: renderOpen(tau)`），
// 于是末帧不是"像"首帧，而是同一个模块、同一个 `tau = 0` 渲出来的同一帧。
// 本引擎的场景是 `t` 的纯函数，所以这里用等价的做法：
//   · **同一个世界**：第 1 段用的是 `_corridor.js` 那份 SDF，这里引**同一份**
//     （`cut(corridor, { params: { impl: 'lines' } })` 时它退回线段版 `corridorSegments()`）
//   · 摄影机减速回到走廊段首帧的位姿
//   · 前景（刻度尺 + 文字）留在屏幕坐标里，不跟着透视走
//
// 真正把"首末逐像素相同"钉住的办法在 CLI 上：
//   node scripts/anim.mjs hashes <pdoom-lab> --baseline
import { css, sat, prog } from '../../../src/core/util.js';
import { camera3, project3, depthScale } from '../../../src/core/cam.js';
import { makeCorridorPass, corridorUniforms } from './_corridor.js';
import { corridorSegments, corridorCam3, camPost, sparkAt, drawCorridorSegments, WORLD, DUR } from './_world.js';

export default {
  id: 'loop',

  setup(ctx) {
    // 和第 1 段同一套开关：`params.impl === 'lines'` 时两边都退回线段批，成环的仍然是同一个世界。
    this.impl = ctx.params?.impl === 'lines' ? 'lines' : 'raymarch';
    /** @type {any} */
    this.pass = null;
    this.segs = [];
    if (this.impl === 'raymarch') this.pass = makeCorridorPass(ctx.gl, ctx.P);
    else this.segs = corridorSegments();
  },

  render(ctx) {
    const { f, gl, lines, text, type, comp, P } = ctx;
    const t = f.t;
    const W = ctx.W, H = ctx.H;
    const end = DUR;

    gl.clear(ctx.out, [P.ink[0] * 0.85, P.ink[1] * 0.85, P.ink[2] * 0.85]);

    // ---- 摄影机：从走廊**深处**倒着滑回入口（= 走廊段第一帧的位姿）----
    // `back` 0 → 1：0 = 还在走廊深处、面朝里；1 = 完全回到走廊首帧
    const back = prog(t, WORLD.at.loop + 0.8, end - 0.5, 'inOutCubic');
    const start = corridorCam3(0);                     // 走廊段首帧的位姿（第 1 段的第一帧）
    const from = { pos: [0.0, 0.35, -30], target: [0.0, 0.15, -36], roll: -0.05, fov: 56 };
    const mixv = (a, b) => [a[0] + (b[0] - a[0]) * back, a[1] + (b[1] - a[1]) * back, a[2] + (b[2] - a[2]) * back];
    const cam = camera3({
      pos: mixv(from.pos, start.pos),
      target: mixv(from.target, start.target),
      roll: from.roll + (start.roll - from.roll) * back,
      fov: from.fov + (start.fov - from.fov) * back,
      H,
    });

    // 火花（母题）：收尾时它熄灭，所以片子成环
    const sp = sparkAt(t);

    // ---- 同一个世界 ----
    if (this.impl === 'raymarch') {
      // 入场时整段压暗再亮起来（线段版是靠 alpha 的 `0.55 + 0.45*back` 做的同一件事）
      this.pass.set(corridorUniforms(cam, {
        spark: sp,
        sparkLit: sp[3],
        dim: 0.55 + 0.45 * back,
      })).render(gl, ctx.out, t, f.dt);
    } else {
      lines.begin();
      drawCorridorSegments(cam, lines, W, H, this.segs, P, { alpha: 0.55 + 0.45 * back });

      const s3 = project3(cam, W, H, sp[0], sp[1], sp[2]);
      if (s3.w > 0.2 && sp[3] > 0.01) {
        const lit = sp[3] * (0.86 + 0.14 * Math.sin(t * 91.7) * Math.sin(t * 57.3));
        const r = Math.max(3, Math.min(30, 34 * depthScale(cam, s3.w, H)));
        lines.seg(s3.x, s3.y, s3.x + 0.01, s3.y, r * 2.4, [P.signal[0] * 0.36 * lit, P.signal[1] * 0.36 * lit, P.signal[2] * 0.36 * lit, 0.32]);
        lines.seg(s3.x, s3.y, s3.x + 0.01, s3.y, r, [P.ember[0] * 2.5 * lit, P.ember[1] * 2.5 * lit, P.ember[2] * 2.5 * lit, 0.85]);
        lines.seg(s3.x, s3.y, s3.x + 0.01, s3.y, r * 0.36, [5.6 * lit, 4.7 * lit, 3.7 * lit, 1]);
      }
      lines.flush(ctx.out);
    }

    // ---- 前景刻度尺：**固定在屏幕坐标**上 ----
    // 它不参与世界运镜（那是背景的事），所以直接画；`setXform` 的透视主要作用在
    // "贴在世界里的东西"上。收尾时透视强度收到 0，于是末帧落在和首帧同样的构图上。
    const yBase = 858;
    for (let i = 0; i <= 24; i++) {
      const x = 120 + i * 70;
      const big = i % 4 === 0;
      const k = big ? 0.85 : 0.45;
      const a = 0.55 + 0.45 * back;
      lines.seg(x, yBase, x, yBase + (big ? 26 : 12), big ? 2.6 : 1.6, [P.bone[0] * k * a, P.bone[1] * k * a, P.bone[2] * k * a]);
    }
    lines.seg(120, yBase, 120 + 24 * 70, yBase, 1.6, [P.bone[0] * 0.5, P.bone[1] * 0.5, P.bone[2] * 0.5]);
    lines.seg(120, yBase, 120 + 24 * 70 * back, yBase, 4.0, [P.signal[0] * back, P.signal[1] * back, P.signal[2] * back]);
    lines.flush(ctx.out);

    text.clear();
    const a = sat((t - WORLD.at.loop - 0.4) / 0.6) * sat((end - t) / 1.1);
    if (a > 0.01) {
      type.writeLine('回到第一帧', 960, 176, {
        anchor: 'center', size: 44, weight: 600, family: 'sans',
        color: css(P.bone, 0.9 * a), tracking: 0.28,
      });
      type.writeLine('同一份几何、同一台摄影机 —— 成环靠的是几何，不是转场', 960, 238, {
        anchor: 'center', size: 27, weight: 500, family: 'mono',
        color: css(P.ash, 0.7 * a), tracking: 0.14,
      });
    }
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });

    // ---- `camXform` / `setXform` 在这里**故意不用** ----
    //
    // `ctx.setXform` 是"把**整张前景**（矢量 + 文字）当一组做射影变换" —— 引擎在场景
    // 跑完后用一张全屏 Pass 重采样整帧。所以它会把**屏幕空间的 HUD**（这段的刻度尺）
    // 一起推走，构图就散了。
    //
    // 什么时候该用它：整层东西都在**世界坐标**里画、要跟着世界一起被透视。
    // 什么时候不该用：前景是屏幕空间的版面元素（刻度尺、角标、字幕）。
    //
    // 它和 `project()` 的等价性已经由 `tools/test-cam-math.mjs` 的
    // 「camXform 与 project(k) 逐像素一致」（8 组机位 × 5 个世界点，逐点 1e-6）钉住了，
    // 所以这里不摆拍也不影响"这套能力是真的"。
    //
    // 用法一行（想要的时候照抄）：
    //   ctx.setXform(camXform(cam2d, W, H, k, { edge: 'black' }));

    return camPost(t, f.idx, {
      bloom: 0.34, bloomThreshold: 0.92, grain: 0.03, vignette: 0.44,
      fade: 0.3 * sat((t - (end - 0.7)) / 0.7),
    });
  },
};
