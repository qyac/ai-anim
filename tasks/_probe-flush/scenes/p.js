import { css } from '../../../src/core/util.js';
import { drawIcon } from '../../../src/kit/icons.js';

export default {
  id: 'probe',
  render(ctx) {
    const { gl, P, lines, text, type, comp } = ctx;
    gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);
    lines.begin();
    lines.seg(200, 200, 800, 200, 2, [1, 1, 1, 0.4]);
    lines.flush(ctx.out);          // ← 先 flush 一次
    drawIcon(lines, 'check', 500, 300, 60, [P.signal[0], P.signal[1], P.signal[2], 1]);
    lines.flush(ctx.out);          // ← 再 flush（这就是 compare 里的场景）
    drawIcon(lines, 'cross', 700, 300, 60, [P.bone[0], P.bone[1], P.bone[2], 1]);
    lines.flush(ctx.out);
    text.clear();
    type.write('after-flush drawIcon', 500, 420, { size: 24, family: 'mono', color: css(P.ash), t: 0 });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return {};
  },
};
