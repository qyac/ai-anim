// iris —— 圆形揭示的图册：世界从主体那一点被揭开。
//
// 「主体打开自己的世界」：一个 20 行的圆形遮罩 Pass —— 圆内原样、圆外压暗 6×，
// 半径 = k×1400（iris() 只给进度，画面该开多大是场景自己的事）。
// 上一版只有一个描边圆环、圆内外一样亮 —— 验收原话「没读过代码的人看不出它在干什么」；
// reveal 的语义必须靠「圆外暗、圆内亮」才读得出来。
import { makeShot, withAlpha } from '../../../src/kit/index.js';
import { iris } from '../../../src/kit/carry.js';
import { css } from '../../../src/core/util.js';
import { Pass } from '../../../src/core/gl.js';

export default makeShot('iris', {
  setup(ctx) {
    // 圆形遮罩：vUv 距圆心 < r 原样，否则乘 0.16（压暗 6×）。
    this.mask = new Pass(ctx.gl, `
      uniform sampler2D under;
      uniform vec2 c;      // 圆心（uv）
      uniform float r;     // 半径（uv，按画面短边比例）
      void main() {
        // 半径 r 以**像素**计（uv 的 y 分量），x 方向先除掉宽高比、比较后再统一 ——
        // 圆才是圆（第一版把 x 拉伸 1.78×，圆变椭圆、全开也盖不满画面、左右被压暗，
        // 看图验收抓的）。
        vec2 d = (vUv - c) * vec2(1920.0, 1080.0) / 1080.0;   // 都归一到 1080 基准
        float inside = step(length(d), r);
        vec3 col = texture(under, vUv).rgb;
        fragColor = vec4(mix(col * 0.16, col, inside), 1.0);
      }`, { under: { value: null }, c: [0.5, 0.52], r: 0 }, { key: 'iris_mask', blend: false });
  },

  draw(ctx, { enter }) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const { k } = iris(f.lt, 0.25, 0.9);
    const cx = 960, cy = 560, r = k * 1400;
    lines.begin();
    // 「世界」：网格 + 几组内容块（揭开后要看的东西）
    for (let i = 0; i <= 12; i++) {
      const y = 120 + i * 80;
      lines.seg(120, y, 1800, y, 1, [P.ash[0], P.ash[1], P.ash[2], 0.35]);
    }
    for (let i = 0; i <= 10; i++) {
      const x = 200 + i * 160;
      lines.seg(x, 120, x, 1080, 1, [P.ash[0], P.ash[1], P.ash[2], 0.18]);
    }
    lines.rect(520, 300, 340, 200, 1.5, withAlpha(P.bone, 0.5));
    lines.rect(1060, 640, 340, 200, 1.5, withAlpha(P.bone, 0.5));
    lines.rect(520, 640, 340, 200, 1.5, withAlpha(P.bone, 0.35));
    // 主体 + 揭示圆环
    if (k > 0.01) {
      lines.circle(cx, cy, Math.max(1, r), 2.5, withAlpha(P.signal, 0.9));
      lines.seg(cx - 30, cy, cx + 30, cy, 1.5, P.bone);
      lines.seg(cx, cy - 30, cx, cy + 30, 1.5, P.bone);
    }
    lines.flush(ctx.out);

    text.clear();
    type.writeLine('iris', 96, 120, { anchor: 'left', size: 30, family: 'mono', color: css(P.ash), ...enter(0) });
    type.writeLine('世界从主体那一点被揭开（圆外压暗 6×）', 96, 156, { anchor: 'left', size: 20, family: 'mono', color: css(P.ash), ...enter(0.1) });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });

    // 圆形遮罩叠在后处理之前：直接渲到 ctx.out 上（under = 当前 out）。
    // ⚠ RT 传纹理 uniform 要按 world.js:266 的先例包 { tex, __tex: true } ——
    //   第一版直接传 ctx.out，uniform 拿不到纹理、遮罩整帧没生效（看图验收抓的）。
    if (k < 1) {
      const u = this.mask.u;
      u.under.value = { tex: /** @type {any} */ (ctx.out).tex ?? ctx.out, __tex: true };
      u.r.value = r / 1080;
      this.mask.render(gl, ctx.out);
    }
    return { bloom: 0.15, grain: 0.02 };
  },
});
