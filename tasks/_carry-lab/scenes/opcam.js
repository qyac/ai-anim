// opcam —— operatorCam 的图册：键控摄影机之上的「操作员手感」三件套。
//
// ① 跟拍提前量：lead 0.1s —— 相机先到，读作"追"而不是"跟"；
// ② rest 归零：1.5–2.1s 主体完全静止，相机浮动也归零（clearing 假红的教训）；
// ③ 落地 shake：2.4s 主体砸地，hits=[2.4, 10, 0.35] 确定性衰减。
// 基座是 makeCam（src/core/cam.js 的 2D 键控：对数 zoom、不动点推近）。
import { makeShot, withAlpha } from '../../../src/kit/index.js';
import { operatorCam } from '../../../src/kit/carry.js';
import { makeCam } from '../../../src/core/cam.js';
import { spring, css } from '../../../src/core/util.js';

export default makeShot('opcam', {
  setup(ctx) {
    // 主体轨迹：0→1.4s 从左移到中，1.5–2.1s 静止（rest），2.4s 砸地。
    this.cam = makeCam([
      [0, { x: 0, y: 0 }, 1.0],
      [1.4, { x: 300, y: 0 }, 1.06],
      [2.1, { x: 300, y: 0 }, 1.06],
      [2.4, { x: 300, y: 60 }, 1.1],
    ]);
    this.op = operatorCam(this.cam, {
      lead: 0.1,
      drift: 3,
      hits: [[2.4, 10, 0.35]],
      rests: [[1.5, 2.1]],
      seed: 3,
    });
  },
  draw(ctx, { enter }) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const t = f.lt;
    // 主体：x 随 makeCam 同步移动（演示"跟拍"）；2.4s 落地：先压扁（底边钉在地面、
    // 高度被压掉）再弹起 —— 第一版只有"上弹"没有"压扁"，落地瞬间反而悬空（验收抓的）。
    // ⚠ y 是**底边**：方块画在 (x-34, y-68)~(x+34, y)。
    const s2 = t >= 2.4 ? spring(t - 2.4, 1, 160, 14) : 0;        // 0→1 的落地脉冲
    const sq = Math.sin(Math.min(Math.PI, s2 * Math.PI)) * (t >= 2.4 ? 1 : 0); // 压扁包络
    const hop2 = Math.max(0, spring(t - 2.4, 90, 160, 14) - 26 * sq); // 压扁期不给上弹
    const subj = { x: 300 + Math.min(t, 1.4) * 380, y: 700 - hop2 };
    const sqH = 68 * (1 - 0.35 * sq);                              // 压扁时高度收缩 35%
    const cam = this.op.at(t);
    lines.begin();
    // 地面参考线（相机移动时它在动 = 运镜可读）
    for (let i = 0; i < 8; i++) {
      const gx = i * 280 - (cam.x - 300);
      lines.seg(gx, 760, gx, 800, 1.2, withAlpha(P.ash, 0.4));
    }
    lines.seg(-400, 700, 2400, 700, 1.5, withAlpha(P.ash, 0.5));
    // 主体方块（底边 = subj.y，高度随压扁收缩）
    lines.rect(subj.x - 34, subj.y - sqH, 68, sqH, 2.5, P.bone);
    lines.fillRect(subj.x - 34, subj.y - sqH, 68, sqH, [P.signal[0], P.signal[1], P.signal[2], 0.15]);
    // 相机读数：把 op 的 drift/shake 画成角标曲线（可视化"手感"）
    const bx = 1620, by = 860, sc = 4;
    lines.seg(bx, by, bx + 240, by, 1.2, withAlpha(P.ash, 0.5));
    lines.seg(bx + 120, by - 30, bx + 120, by + 30, 1.2, withAlpha(P.ash, 0.3));
    for (let i = 1; i <= 60; i++) {
      const t0 = Math.max(0, t - (60 - i) * 0.05), t1 = t - (60 - i) * 0.05 + 0.05;
      const a = this.op.at(t0), b = this.op.at(t1);
      lines.seg(bx + i * 4, by + (a.shakeY + a.driftY) * sc, bx + (i + 1) * 4, by + (b.shakeY + b.driftY) * sc,
        1.2, withAlpha(P.signal, 0.8));
    }
    lines.flush(ctx.out);

    text.clear();
    type.writeLine('operatorCam', 240, 120, { anchor: 'left', size: 30, family: 'mono', color: css(P.ash), ...enter(0) });
    type.writeLine('lead 0.1s · rest 1.5–2.1 归零 · hit 2.4s', 240, 156, { anchor: 'left', size: 20, family: 'mono', color: css(P.ash), ...enter(0.1) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    // 相机交给 post：zoom 用 base 的、shake 用 op 的（drift + hit 都在里面）
    return { bloom: 0.12, grain: 0.02, zoom: cam.zoom, shake: [cam.driftX + cam.shakeX, cam.driftY + cam.shakeY] };
  },
});
