import { css } from '../../../src/core/util.js';
import { loadAsset, drawAsset } from '../../../src/kit/assets.js';

export default {
  id: 'assetDemo',
  async setup(ctx) {
    this.logo = await loadAsset(ctx, 'nekohome-logo');
    this.missing = await loadAsset(ctx, 'does-not-exist');   // 故意：应当画占位框并记警告，而不是崩
  },
  render(ctx) {
    const { f, gl, P, lines, text, type, comp, W, H } = ctx;
    gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);
    lines.begin();
    // 成比例的 logo（等比铺满，不拉伸）
    drawAsset(ctx, this.logo, [140, 240, 700, 200], { opacity: 0.96 });
    // 故意的缺图：应当出现虚线占位 + 交叉线
    drawAsset(ctx, this.missing, [140, 520, 700, 260], { opacity: 1 });
    lines.flush(ctx.out);
    text.clear();
    type.write('assets/manifest.json → loadAsset() → drawAsset()', 140, 180, { size: 26, weight: 700, family: 'mono', color: css(P.bone), t: 0 });
    type.write('下面是缺 id 的占位（缺图不崩，画虚线框 + 记 ctx.warnings）', 140, 470, { size: 20, weight: 500, family: 'mono', color: css(P.ash), t: 0 });
    type.write('warnings: ' + (ctx.warnings?.length ?? 0), 140, H - 90, { size: 20, weight: 500, family: 'mono', color: css(P.graphite), t: 0 });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });
    return { bloom: 0.15, grain: 0.02 };
  },
};
