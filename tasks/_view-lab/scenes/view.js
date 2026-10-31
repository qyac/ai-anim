// @ts-check
/**
 * 仪器视图夹具（`src/kit/views.js` 的标定卡）。
 *
 * 一段一种成像方式，全部画**同一张底图**：一条真曲线 + 一组柱子 + 一块渐变 +
 * 一行字。只有底图相同，"换的是介质不是内容"这句话才成立，判据也才可比。
 *
 * 为什么底图里必须有**渐变和文字**：
 *   · 渐变检验抖动的阈值顺序（Bayer 会把它变成整齐的棋盘台阶，写错就是噪点）；
 *   · 文字检验格子的相位（字符画 / 半调最容易在字上糊成一团）。
 */

import { css } from '../../../src/core/util.js';
import { instrumented } from '../../../src/kit/views.js';

/** 底图的几何：归一化坐标，换画幅不用重算 */
const CURVE = Array.from({ length: 96 }, (_, i) => {
  const u = i / 95;
  return [0.10 + u * 0.80, 0.62 - 0.30 * Math.sin(u * Math.PI * 2.2) * (0.35 + u * 0.65)];
});

/**
 * @param {string} id 段名
 * @param {string} mode 视图模式（见 src/kit/views.js 的 VIEWS）
 * @param {{ cell?: number, levels?: number, label?: string, note?: string,
 *           passes?: number, misreg?: number, paper?: number[], ink?: number[], accent?: number[] }} [opt]
 */
export function viewShot(id, mode, opt = {}) {
  return {
    id,
    handlesTransition: false,
    /** 底图是图形主体：给它一个明确的 focus，版面守门才判得了 */
    focus: 'center',
    render(ctx) {
      const { f, gl, P, lines, text, type, comp, W, H } = ctx;
      const t = f.lt;

      gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);

      // ---- 底图：一整块渐变 + 曲线 + 柱子 + 两行字 ----
      const drawBase = (target) => {
        // ⚠ 底图必须是**中间调**（中灰纸），不是引擎默认的墨黑底：
        //   半调 / 抖动 / 排线全都是「墨量」语言，纯黑底会让三种介质塌成同一张全黑图
        //   （实测第一版就是这样，八格里有五格一模一样）。这里用 0.62 的灰纸，
        //   既不刺眼、又给亮部与暗部各留出足够多的级。
        const PAPER = 0.62;
        gl.clear(target, [P.bone[0] * PAPER, P.bone[1] * PAPER, P.bone[2] * PAPER]);

        lines.begin();
        // ① 竖向渐变：用 64 根竖条拼（lines 没有渐变，这个最省事也最干净）
        const bands = 64;
        for (let i = 0; i < bands; i++) {
          const u = i / (bands - 1);
          const x = W * 0.58 + (W * 0.34) * u;
          // 暗到亮横跨整段（抖动的 16 级阈值全靠它才看得出来）
          const k = u * u;
          const y0 = H * 0.16;
          const hgt = H * 0.30;
          // 先把这一格压回纸色，再叠渐变 —— 否则渐变会浮在纸上面（看着像贴纸）
          lines.fillRect(x, y0, (W * 0.34) / bands + 1.2, hgt,
            [P.ink[0] * (1 - k) + P.bone[0] * k, P.ink[1] * (1 - k) + P.bone[1] * k, P.ink[2] * (1 - k) + P.bone[2] * k, 1]);
        }
        const bars = [0.35, 0.52, 0.44, 0.72, 0.61, 0.88];
        // ② 曲线：线宽三档都用上，检验细线在高格距下会不会消失
        for (let i = 1; i < CURVE.length; i++) {
          const a = CURVE[i - 1];
          const b = CURVE[i];
          const w = i % 12 === 0 ? 10 : 5;
          lines.seg(a[0] * W, a[1] * H, b[0] * W, b[1] * H, w, P.signal);
        }
        // ③ 柱子：深墨（压在纸上）。⚠ 别用 bone——在灰纸底上 bone 是"更亮的白"，
        //   半调会把它们印成一个个空洞，看着像没画。
        bars.forEach((v, i) => {
          const bw = W * 0.024;
          const x = W * 0.12 + i * bw * 1.5;
          const h = H * 0.20 * v;
          lines.fillRect(x, H * 0.44 - h, bw, h, [P.ink[0], P.ink[1], P.ink[2], 1]);
        });
        // ④ 一条细刻度尺：检验「格子相位」（密排的竖线在字符画下应该还能数出来）
        for (let i = 0; i <= 40; i++) {
          const x = W * 0.10 + (W * 0.80 * i) / 40;
          lines.seg(x, H * 0.80, x, H * 0.80 + (i % 5 === 0 ? 18 : 9), 2.2,
            [P.ink[0], P.ink[1], P.ink[2], 0.92]);
        }
        lines.flush(target);

        text.clear();
        type.write('同一张画面，八种介质', W * 0.10, H * 0.24, {
          size: 'h1', weight: 800, family: 'sans', color: css(P.ink), t: t * 0.9,
        });
        type.write(opt.label ?? mode, W * 0.10, H * 0.92, {
          size: 'label', weight: 600, family: 'mono', color: css(P.ink), alpha: 0.9, t,
        });
        if (opt.note) {
          type.writeLine(opt.note, W * 0.10, H * 0.958, {
            anchor: 'left', size: 22, weight: 500, family: 'mono', color: css(P.ink), alpha: 0.75,
          });
        }
        text.upload();
        comp.draw(gl, text, target, { premult: false });
      };

      // ---- 换一种成像方式贴回画面 ----
      instrumented(ctx, {
        mode,
        cell: opt.cell,
        levels: opt.levels,
        passes: opt.passes,      // 半调：N 版套印（1 = 单版）
        misreg: opt.misreg,      // 半调：套准偏移（逻辑像素）
        paper: opt.paper, ink: opt.ink, accent: opt.accent,
        amount: Math.min(1, Math.max(0, (t - 0.2) / 1.2)),   // 前 1.4s 做「显影」
      }, drawBase);

      return { bloom: 0.10, grain: 0.01, vignette: 0.25 };
    },
  };
}
