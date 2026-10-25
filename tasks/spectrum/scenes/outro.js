// @ts-check
/**
 * 第 7 段 `outro` —— 万物皆可拆。
 *
 * 收尾：前几段的三个形状（方波 / 圆链 / 8×8 格）缩成三个小图标，
 * 落一行字，最后压黑。
 */
import { css, sat, prog } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';
import { L, ink, signal, muted } from './_kit.js';

export default makeShot('outro', {
  draw(ctx) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const t = f.lt / (ctx.params?.stretch ?? 1);
    const H = ctx.H;
    const cy = 470;
    const S = 62;
    const cxs = [760, 960, 1160];

    const appear = prog(t, 0.2, 1.4, 'outCubic');
    lines.begin();
    // ① 方波
    {
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        pts.push([cxs[0] - S + 2 * S * u, cy - Math.sign(Math.sin(u * Math.PI * 4)) * S * 0.42]);
      }
      lines.polyline(pts, 2.2, ink(P, appear));
    }
    // ② 圆链（三圈）
    {
      const rs = [S * 0.62, S * 0.30, S * 0.16];
      let ox = cxs[1];
      rs.forEach((r, i) => {
        lines.circle(ox, cy, r, 1.8, i === 0 ? ink(P, appear) : muted(P, appear * 0.7), 40);
        ox += r * 0.55;
      });
    }
    // ③ 8×8 格（只画外框 + 中线，示意"块"）
    {
      const g = S * 0.30;
      for (let i = 0; i <= 4; i++) {
        lines.seg(cxs[2] - 4 * g + i * 2 * g, cy - 4 * g, cxs[2] - 4 * g + i * 2 * g, cy + 4 * g, 1.2, muted(P, appear * 0.65));
        lines.seg(cxs[2] - 4 * g, cy - 4 * g + i * 2 * g, cxs[2] + 4 * g, cy - 4 * g + i * 2 * g, 1.2, muted(P, appear * 0.65));
      }
    }
    lines.flush(ctx.out);

    text.clear();
    const ent = (d) => ({ alpha: [0, 1], t, staggerDur: 0.6 });
    type.writeLine('SIGNAL / 07', L.x0, 128, { size: 24, family: 'mono', color: css(P.ash), ...ent(0) });
    // ⚠ 画面不复述旁白（最后一句旁白是「万物皆可拆。」）—— 这里只放三个标注
    type.writeLine('把信号拆开', 960, cy + 196, { anchor: 'center', size: 88, weight: 800, family: 'sans', color: css(P.bone), ...ent(0.5) });
    type.writeLine('傅里叶级数 · DCT · 采样定理', 960, cy + 262, { anchor: 'center', size: 26, family: 'mono', color: css(P.ash), ...ent(0.9) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });

    // 最后 0.6 秒压黑
    const fadeOut = prog(t, f.dur ?? 1e9, (f.dur ?? 1e9) + 0.6);
    return { bloom: 0.20, grain: 0.022, fade: 0 };
  },
});