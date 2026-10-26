/**
 * 表情包图层（动图贴纸）：`stickerShot(id, { base, frames, ... })`。
 *
 * **为什么不直接播 GIF**：`render(t)` 必须是 t 的纯函数。GIF 播放器靠时钟推进，
 * 一旦 seek / 多子帧并行就会乱。这里把 GIF 预先抽成 PNG 序列（`ffmpeg -vf fps=12`），
 * 每帧按 `floor(lt * fps) % n` 取第几张 —— 同一时刻永远同一张图。
 *
 * 素材放**任务目录**里（`tasks/<任务>/assets/<名字>/f001.png` …），路径由调用方给
 * （用 Vite 的 `new URL('./assets/x/f001.png', import.meta.url)` 或 `?url` 导入）。
 *
 * 版面纪律：贴纸是**装饰**，不是主体 —— 它落在画面右侧或右下，尺寸 ≤ 画面的 1/3，
 * 并且只出现在**短段**里（1.8–2.6s）。一屏一个主体这条对它同样成立。
 */
import { css, spring, clamp, sat } from '../core/util.js';

/**
 * @param {string} id 段名
 * @param {object} o
 * @param {(i: number) => string} o.frame 第 i 张图的 URL（从 1 开始）
 * @param {number} o.count 总帧数
 * @param {{ size?: number, x?: number, y?: number, fps?: number, spin?: number,
 *           caption?: string, kicker?: string, tone?: 'normal' }} [o]
 */
export function stickerShot(id, o) {
  const count = Math.max(1, Math.floor(o.count));
  const fps = o.fps ?? 12;
  const size = o.size ?? 300;
  return {
    id,
    handlesTransition: false,
    async setup(ctx) {
      const gl = ctx.gl;
      const g = gl.ctx;
      const make = async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const tex = g.createTexture();
        g.bindTexture(g.TEXTURE_2D, tex);
        g.texImage2D(g.TEXTURE_2D, 0, g.SRGB8_ALPHA8, g.RGBA, g.UNSIGNED_BYTE, img);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
        return { tex, __tex: true };
      };
      this.frames = await Promise.all(Array.from({ length: count }, (_, i) => make(o.frame(i + 1))));
    },
    render(ctx) {
      const { f, gl, comp, text, type, lines, P, W, H } = ctx;
      gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);
      // 底：一层很淡的坐标网格（与 blueprint 风格同源，切点两侧不会突然变成纯色）
      lines.begin();
      // ⚠ 调色板里**没有** P.line / P.cyan（那是别的风格包自己的字段）——
      //   通用件只能用 ink / ink2 / graphite / ash / bone / signal 这六个（src/core/palette.js:19-24）。
      const g0 = P.graphite ?? P.ash;
      for (let x = 0; x <= W; x += 60) lines.seg(x, 0, x, H, 1, [g0[0], g0[1], g0[2], 0.16]);
      for (let y = 0; y <= H; y += 60) lines.seg(0, y, W, y, 1, [g0[0], g0[1], g0[2], 0.16]);
      lines.flush(ctx.out);

      // 贴纸：弹簧入场 + 每帧取对应的一张（确定性）
      const k = clamp(spring(f.lt * 1.05) , 0, 1.06);
      const idx = Math.floor(f.lt * fps) % this.frames.length;
      // ⚠ comp.draw 只有 rect / uvRect / tint / opacity / mode —— **没有旋转**。
      //   要"歪一点"的手感就只能靠缩放与上下浮动（下面这两行），别指望 rot。
      const s = size * (0.84 + 0.16 * k);
      const bob = Math.sin(f.lt * 2.1) * 6 * k;          // 呼吸般的上下浮，幅度 6px
      const cx = o.x ?? W * 0.70;
      const cy = (o.y ?? H * 0.50) + bob;
      comp.draw(gl, this.frames[idx], ctx.out, {
        mode: 'normal',
        opacity: Math.min(1, k * 1.2),
        rect: [cx - s / 2, cy - s / 2, s, s],
        tint: [1, 1, 1],
      });

      text.clear();
      if (o.kicker) {
        type.write(o.kicker, 120, 130, { size: 24, weight: 600, family: 'mono', color: css(P.ash), t: f.lt });
      }
      if (o.caption) {
        type.write(o.caption, 120, H * 0.56, {
          size: 64, weight: 800, family: 'sans', color: css(P.bone),
          t: f.lt - 0.12, stagger: 0.03, from: 'up', dist: 28,
        });
      }
      text.upload();
      comp.draw(gl, text, ctx.out, { premult: false });
      return { bloom: 0.22, grain: 0.02 };
    },
  };
}
