// 十一个内容包的快闪（一个场景内部自己切，不是 11 个段）。
//
// 为什么不做成 11 个 cut：say 要求每段都能量到一句话，0.5s 的段装不下一句话，
// 时间线会被撑成 11 × 1.9s ≈ 21s。所以整个快闪是一段，内部按 lt 切名字 ——
// 仍然是 t 的纯函数（没有累积、没有随机），任意 seek 都对得上。
//
// 包名出处：neko-clicker/README.md:5-8（逐字），见 FACTS.md §4。
import { css, sat } from '../../../src/core/util.js';

const PACKS = [
  ['猫咖物语', '示例包'],
  ['猫娘咖啡馆', '#1'],
  ['九命轮回', '#2'],
  ['猫娘实验室', '#3'],
  ['猫娘文明', '#4'],
  ['赛博猫娘', '#5'],
  ['猫娘末世', '#6'],
  ['猫娘神明', '#7'],
  ['猫娘梦境', '#8'],
  ['猫娘图书馆', '#9'],
  ['猫娘公司', '#10'],
];

export const packFlash = {
  id: 'packs',
  render(ctx) {
    const { f, gl, P, lines, text, type, comp, W, H } = ctx;
    const total = Math.max(0.4, f.end - f.start);
    const n = PACKS.length;
    const step = total / n;
    const i = Math.min(n - 1, Math.floor(f.lt / step));
    const local = f.lt - i * step;              // 这一闪内部的相位
    const name = PACKS[i][0];
    const tag = PACKS[i][1];

    // 底：整帧墨色 + 每闪换一点明度（切点读起来才像闪，而不是换字）
    const lift = 0.03 + 0.035 * (i % 3);
    gl.clear(ctx.out, [P.ink[0] + lift, P.ink[1] + lift, P.ink[2] + lift]);

    // 一条横扫的斜线 + 底部 11 个序号刻度（当前那个更宽更亮）
    const sweep = sat(local / Math.min(0.22, step * 0.5));
    lines.begin();
    const x0 = W * (1 - sweep);
    lines.seg(x0 + 120, 0, x0 - 200, H, 2, [P.signal[0], P.signal[1], P.signal[2], 0.22]);
    for (let k = 0; k < n; k++) {
      const on = k === i;
      const c = on ? P.signal : P.graphite;
      lines.fillRect(160 + k * 46, H - 150, on ? 34 : 12, on ? 6 : 3, [c[0], c[1], c[2], on ? 0.95 : 0.5]);
    }
    lines.flush(ctx.out);

    // 名字：每次砸进来（0.12s 内从 1.12 倍落到 1.0）
    const slam = 1.12 - 0.12 * Math.min(1, local / 0.12);
    text.clear();
    type.write(name, W * 0.12, H * 0.56, {
      size: Math.round(132 * slam), weight: 800, family: 'sans', color: css(P.bone),
      t: f.lt - i * step, stagger: 0.02, from: 'up', dist: 36,
    });
    type.write(String(i + 1).padStart(2, '0') + ' / ' + n, W * 0.12, H * 0.28, {
      size: 30, weight: 700, family: 'mono', color: css(P.signal), t: f.lt,
    });
    type.write(tag, W * 0.12, H * 0.68, {
      size: 26, weight: 600, family: 'mono', color: css(P.ash), t: f.lt,
    });
    type.write('十一个内容包 · 换包不换引擎', W * 0.12, H * 0.80, {
      size: 24, weight: 600, family: 'sans', color: css(P.graphite), t: f.start + 0.2,
    });
    text.upload();
    comp.draw(gl, text, ctx.out, { premult: false });

    // 闪切时给一点整体闪白（0 → 0.10，两帧内衰完）
    return { bloom: 0.26, grain: 0.02, flash: 0.10 * (1 - Math.min(1, local / 0.10)) };
  },
};
