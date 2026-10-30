// @ts-check
/**
 * 同一份内容，两套 token（BACKLOG 1-47 的目视夹具）。
 *
 * 内容：把方波拆成 4 条奇次谐波 —— 每条淡淡画出，和曲线用"主笔"画粗。
 * 差别只有三样：字号阶梯、线宽三档、入场运动。**几何一模一样**，所以两张图的差异全部来自 token。
 */
import { css, spring, prog } from '../../../src/core/util.js';
import { makeShot } from '../../../src/kit/index.js';
import { TOKENS, BEFORE_TOKENS } from '../../../src/style/tokens.js';

const HARM = [1, 3, 5, 7];
const TWO_PI_X = Math.PI * 4;      // 两个周期

export default makeShot('token', {
  draw(ctx) {
    const { f, lines, text, type, P, comp, gl } = ctx;
    const after = ctx.params?.mode !== 'before';
    // after = **这套风格的 token**（`ctx.style.tokens`，随 `--style` 走）；
    // before = 实测到的"改造前"分布（固定值，不跟风格走 —— 它就是要当对照组）。
    const T = after ? (ctx.style?.tokens ?? TOKENS) : BEFORE_TOKENS;
    /**
     * 语义字号（BACKLOG 1-46）：after 这条路写的是**名字**，不是数字 ——
     * 同一份场景换 `--style`，层级跟着风格包走；before 那条路保留数字（对照组）。
     */
    const sz = (k) => (after ? k : T.type[k]);
    const t = f.lt;

    // 入场：after = 弹簧（带回弹）+ 错峰；before = 匀速 prog（现存场景的主流写法）
    const eTitle = after ? spring(t - 0.10) : prog(t, 0.10, 0.90);
    const eWave = after ? spring(t - 0.26) : prog(t, 0.10, 0.90);

    const X0 = T.pad.x;
    const X1 = 1920 - T.pad.x;
    const yc = after ? 812 : 748;
    const amp = 128;

    const alpha = (e) => [0, 1].map((_, i) => (i ? Math.min(1, Math.max(0, e)) : 0));

    // 背景：纯色铺满（任务没声明 world、也不画母题 —— 用户拍板：网格直接去掉，
    // 高级感靠排版/线宽/层次，不靠背景）。没这一句，整帧就是上一帧的残留。
    gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);

    // ── 图形 ───────────────────────────────────────────────
    lines.begin();

    // 1) 四条谐波（淡）
    for (let k = 0; k < HARM.length; k++) {
      const pts = [];
      for (let i = 0; i <= 520; i++) {
        const u = i / 520;
        const x = u * TWO_PI_X;
        pts.push([X0 + (X1 - X0) * u, yc - (Math.sin(HARM[k] * x) / HARM[k]) * amp * eWave]);
      }
      lines.polyline(pts, T.rule.hair, [P.graphite[0], P.graphite[1], P.graphite[2], 0.42]);
    }

    // 2) 理想方波参照（极淡竖划）
    for (let i = 0; i <= 96; i++) {
      const u = i / 96;
      const s = Math.sin(u * TWO_PI_X);
      const y = yc - Math.sign(s) * amp * 0.62 * eWave;
      const x = X0 + (X1 - X0) * u;
      lines.seg(x, y - 4, x, y + 4, T.rule.hair, [P.ash[0], P.ash[1], P.ash[2], 0.22]);
    }

    // 3) 和曲线（主笔）
    const sum = [];
    for (let i = 0; i <= 900; i++) {
      const u = i / 900;
      const x = u * TWO_PI_X;
      const s = HARM.reduce((acc, n) => acc + Math.sin(n * x) / n, 0);
      sum.push([X0 + (X1 - X0) * u, yc - s * amp * eWave]);
    }
    lines.polyline(sum, T.rule.hero, [P.bone[0], P.bone[1], P.bone[2], 1]);

    // 4) 基线
    lines.seg(X0, yc, X1, yc, T.rule.hair, [P.ash[0], P.ash[1], P.ash[2], 0.30]);
    lines.flush(ctx.out);

    // ── 文字 ───────────────────────────────────────────────
    text.clear();

    // 眉标
    type.write('FOURIER · 4 项', X0, after ? 176 : 126, {
      size: sz('label'), weight: T.weight.label, family: 'mono', color: css(P.ash),
      alpha: alpha(eTitle), t: t - 0.10, stagger: T.motion.stagger,
    });

    // 主张（hero：整屏只有一个）
    type.write('把方波拆开', X0, after ? 330 : 176, {
      size: sz('hero'), weight: T.weight.hero, family: 'sans', color: css(P.bone),
      alpha: alpha(eTitle), t: t - 0.16, stagger: T.motion.stagger,
    });

    // 一句解释（副题）
    type.write('四条正弦叠起来，边就直了', X0, after ? 418 : 214, {
      size: sz('h2'), weight: T.weight.h2, family: 'sans', color: css(P.ash),
      alpha: alpha(eTitle), t: t - 0.24, stagger: T.motion.stagger,
    });

    // 谐波图例（四个小标签）—— 浮在整条曲线**上方**（第一段"平台"之上），不然和笔画叠在一起
    for (let k = 0; k < HARM.length; k++) {
      const lx = X0 + 160 + k * (after ? 132 : 96);
      type.write('n = ' + HARM[k], lx, yc - amp - 56, {
        size: sz('label'), weight: T.weight.label, family: 'mono', color: css(P.ash),
        alpha: alpha(eWave), t: t - 0.30 - k * T.motion.stagger, stagger: T.motion.stagger,
      });
    }

    // 出处（公式）
    type.write('y = Σ sin(nx) / n', X1, after ? 980 : 968, {
      size: sz('label'), weight: T.weight.label, family: 'mono', color: css(P.ash),
      align: 'right', alpha: alpha(eWave), t: t - 0.34,   // ⚠ 数组型 alpha 必须配 t，否则取 k=0 → 整行隐形
    });

    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });

    return { bloom: T.texture.bloom, grain: T.texture.grain, vignette: T.texture.vignette, ca: T.texture.ca };
  },
});
