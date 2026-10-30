// 图标总览场景（_icon-sheet 专用）
import { css, mixColor } from '../../../src/core/util.js';
import { drawIcon, ICON_NAMES } from '../../../src/kit/icons.js';

export default {
  id: 'iconSheet',
  render(ctx) {
    const { f, gl, P, lines, text, type, comp, W, H } = ctx;
    gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);
    const cols = 6;
    const rows = Math.ceil(ICON_NAMES.length / cols);
    const cw = (W - 240) / cols;
    const ch = (H - 260) / rows;
    lines.begin();
    ICON_NAMES.forEach((n, i) => {
      const cx = 120 + (i % cols) * cw + cw / 2;
      const cy = 150 + Math.floor(i / cols) * ch + ch / 2 - 18;
      const size = Math.min(72, ch * 0.42);
      const col = n === 'cat' ? P.signal : mixColor(P.bone, [1, 1, 1], 0.15);
      drawIcon(lines, n, cx - size / 2, cy - size / 2, size, [col[0], col[1], col[2], 0.92]);
    });
    lines.flush(ctx.out);
    text.clear();
    ICON_NAMES.forEach((n, i) => {
      const cx = 120 + (i % cols) * cw + cw / 2;
      const cy = 150 + Math.floor(i / cols) * ch + ch / 2 + 34;
      type.write(n, cx - n.length * 5.6, cy, { size: 17, weight: 500, family: 'mono', color: css(P.ash), t: f.lt - i * 0.01 });
    });
    type.write('内置矢量图标库 · src/kit/icons.js', 120, 92, { size: 26, weight: 700, family: 'mono', color: css(P.bone), t: 0 });
    type.write('折线定义（24×24），零素材、零 IO、确定性；颜色跟调色板走', 120, H - 96, { size: 20, weight: 500, family: 'mono', color: css(P.graphite), t: 0 });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.2, grain: 0.02 };
  },
};
