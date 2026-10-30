// @ts-check
/**
 * `src/kit/info.js` —— **infoShot 段落骨架**（BACKLOG 1-50）。
 *
 * ## 解决什么
 *
 * 实测每支片子的手写场景 1472–3981 行，其中**四分之三是同一副骨架**：
 * 眉标、标题、图形区的面板底、侧标注、出处行、页脚、进出场错峰、把 post 拼起来。
 * 每次重抄都会漂移（少一个 `text.clear()`、漏一处 `assertInBand`、focus 忘声明）。
 * `infoShot` 把这副骨架封成工厂：**你只写 `draw(ctx, rect)` 里"这段的图"**，
 * 版面纪律（字幕带避让 / 一屏块数 / focus 声明 / 出处行）全部由骨架承担。
 *
 * ## 与 makeShot 的关系
 *
 * `makeShot` 包的是**转场四件套**（handlesTransition / 共享背景 / 甩镜 / 摄影机）；
 * `infoShot` 包的是**信息版面五件套**（眉标+标题 / 面板底 / 侧标注 / 出处 / 页脚）。
 * infoShot 内部**不用** makeShot —— 它默认"段在片子里由世界层铺背景"（`world: 'auto'`），
 * 因为信息段的底是版面，不是景观。两个可以叠：`infoShot` 返回的是普通场景对象，
 * 你仍然可以在时间线上给它 `overlap` 与 `transition`。
 *
 * ## 用法
 *
 * ```js
 * import { infoShot } from '../../../src/kit/index.js';
 *
 * export default infoShot('频谱-概览', {
 *   title: '把信号拆开',
 *   kicker: 'SPECTRUM / 02',
 *   caption: '8×8 DCT · 基底图案',
 *   source: 'JPEG · Annex A',
 *   draw(ctx, rect) {
 *     // rect = { x, y, w, h }：图形区。只画"这段的图"，别的都不用管。
 *     const { lines, P } = ctx;
 *     lines.begin();
 *     lines.seg(rect.x + 40, rect.y + 60, rect.x + rect.w - 40, rect.y + 60, 3, P.signal);
 *     lines.flush(ctx.out);
 *   },
 * });
 * ```
 *
 * 只写字幕会讲的那一句的**名词部分**当 caption（CAPTIONS.md 的分工：句子交给旁白与字幕）。
 *
 * ## 版面纪律（骨架替你守的）
 *
 * | 纪律 | 怎么守 |
 * |---|---|
 * | 字幕保留带 | 眉标/标题/面板/出处/页脚的 y 全部从 `ctx.grid` 取，永不进 `captionBand`；图形区上界压在 `contentBottom` 之下 |
 * | 一屏一个主体 | 面板底占位 = 天然的 focus；骨架把 `focus` 声明成图形区矩形 |
 * | 出处行 | `source` 给了就画在 caption 带的 src 位（来源要可查，FACTS.md 的硬规则） |
 * | 错峰 | 标题先、面板再、图后、标注尾 —— 四段错峰 0.18s，都在 `enter` 参数可调 |
 */

import { css, ease, prog, clamp } from '../core/util.js';
import { panelBox } from './panel.js';
import { bandsOf, captionNote } from './bands.js';

/**
 * 默认版面：图形区占内容带的比例（左右留白给标注）。
 * 图形区不小于 880×520（1920×1080 下）—— 再小就不是"信息段"而是"卡片"了。
 */
const DEFAULTS = {
  /** 错峰：标题 → 面板 → draw → 标注的间隔（秒） */
  enter: 0.18,
  /** 面板底占内容带宽的比例（0.62 = 左右各留 ~19%） */
  panelK: 0.62,
  /** 面板 tone（压暗程度，见 panel.js 的"alpha 管在不在，tone 管亮不亮"） */
  tone: 1,
  /** 页脚左侧文字（通常是这一段的编号） */
  foot: '',
  /** 不声明 focus（版面守门判"没判"） */
  noFocus: false,
};

/**
 * 造一个"信息段"场景：眉标 + 标题 + 面板底（图形区）+ 侧标注 + 出处行 + 页脚。
 *
 * @param {string} id 段名
 * @param {{
 *   title?: string, kicker?: string, caption?: string, source?: string,
 *   foot?: string, enter?: number, panelK?: number, tone?: number, noFocus?: boolean,
 *   post?: Record<string, any>,
 *   draw: (ctx: any, rect: { x: number, y: number, w: number, h: number }, k: number) => any,
 * }} spec
 *   `draw(ctx, rect, k)`：k = 这一段自己的入场进度（0..1），错峰已经扣掉；
 *   返回值（如果有）作为这一帧的 post 与骨架默认 post 合并。
 * @returns {any} 普通场景对象（`{ id, focus, render }`，可直接进时间线）
 */
export function infoShot(id, spec) {
  const o = { ...DEFAULTS, ...spec };
  return {
    id,
    /**
     * 主体 = 图形区（版面守门：声明了才判"主体区里压了几块"）。
     * ⚠ focus 在**渲染前**就要被引擎读到（engine.js 的 _ctxFor 先组 ctx 再调 render），
     *   而图形区的精确矩形要到 render 里按 ctx.grid 才算得出来 —— 两者差一帧，不能动态补。
     *   所以这里给的是**按 1920×1080 基准的近似矩形**（横屏大多数任务够用）；
     *   竖屏或自改版面的任务传 `noFocus: true`，自己在时间线段上写 `focus`（那份优先）。
     */
    focus: o.noFocus ? null : { x: 386, y: 188, w: 1148, h: 704, source: 'info' },

    render(ctx) {
      const { f, gl, P, text, type, comp, lines, grid } = ctx;
      const { W, H } = gl;
      const t = f.lt;
      const b = bandsOf(ctx);

      // ── 版面计算：所有 y 从 grid 取，图形区压在 contentBottom 之下 ──
      const panelK = clamp(Number(o.panelK) || 0.62, 0.3, 0.92);
      const pw = Math.round((b.caption.x1 - b.caption.x0) * panelK);
      const px = Math.round((W - pw) / 2);
      const py = b.tag.y + 96;
      const contentBottom = grid?.contentBottom ?? Math.round(H * 0.833);
      const ph = contentBottom - py - 8;
      const rect = { x: px, y: py, w: pw, h: ph };
      if (!o.noFocus) this.focus = { x: px, y: py, w: pw, h: ph, source: 'info' };

      const e = Number(o.enter) || 0.18;
      const kTitle = ease.outCubic(prog(t, 0.10, 0.10 + 0.55));
      const kPanel = ease.outCubic(prog(t, 0.10 + e, 0.10 + e + 0.55));
      const kDraw = ease.outCubic(prog(t, 0.10 + e * 2, 0.10 + e * 2 + 0.55));
      const kNote = ease.outCubic(prog(t, 0.10 + e * 3, 0.10 + e * 3 + 0.55));

      // ── 底：引擎的世界层（world: 'auto'）已经铺了；这里只补一个极淡的整帧收口 ──
      // （信息段的"底"是版面不是景观；没有 world 时 panelBox 自己够不满帧，得压一层）
      if (!ctx.world) {
        gl.clear(ctx.out, [P.ink[0], P.ink[1], P.ink[2]]);
      }

      // ── 1) 眉标（tag 带内，不进字幕带）──
      text.clear();
      const kick = String(o.kicker ?? '');
      if (kick) {
        type.write(kick, b.tag.x0, b.tag.y, {
          size: b.tag.size ?? 30, family: 'mono', tracking: 6,
          color: css(P.signal, 0.9), alpha: clamp(kTitle),
        });
      }

      // ── 2) 标题（面板上方、tag 之下）──
      const title = String(o.title ?? '');
      if (title) {
        type.writeLine(title, Math.round(W / 2), py - 18, {
          anchor: 'center', size: 44, weight: 700, family: 'sans',
          color: css(P.bone), alpha: clamp(kTitle),
        });
      }

      // ── 3) 面板底（图形区）──
      if (kPanel > 0.01) {
        panelBox(ctx, {
          x: px, y: py, w: pw, h: ph,
          alpha: kPanel, tone: o.tone,
          edge: true, fill: true, fillK: 0.94, corner: 20,
        });
      }

      // ── 4) 用户的图（draw 回调；错峰已扣在 kDraw 里）──
      let postExtra = null;
      if (kDraw > 0.001 && typeof o.draw === 'function') {
        try {
          postExtra = o.draw(ctx, rect, kDraw);
        } catch (err) {
          // draw 抛错不吞：转成运行期警告（check 会打印），画面继续出
          const msg = `infoShot(${id}).draw 抛错：${String(err?.message ?? err)}`;
          if (ctx?.warnings && !ctx.warnings.includes(msg)) ctx.warnings.push(msg);
        }
      }

      // ── 5) 侧标注 + 出处行（caption 带：标注短句 + src 小字）──
      // captionNote 内部直接往 lines 推一条横线（不走 begin/flush 周期），
      // 所以它后面必须跟一次 flush —— offset 为 0 时 flush 是无害的 no-op。
      const cap = String(o.caption ?? '');
      if (cap && kNote > 0.01) {
        captionNote(ctx, { text: cap, src: o.source || undefined, alpha: clamp(kNote) });
        lines.flush(ctx.out);
      }
      const foot = String(o.foot ?? '');
      if (foot) {
        type.writeLine(foot, b.foot.x0, b.foot.y, {
          anchor: 'left', size: b.foot.size ?? 22, family: 'mono',
          color: css(P.ash, 0.75 * clamp(kNote)),
        });
      }
      text.upload();
      comp.draw(gl, text, ctx.out, { premult: false });

      const base = {
        bloom: 0.28,
        grain: 0.03,
        vignette: 0.42,
      };
      // 合并优先级：骨架默认 < 段 spec.post < draw 的返回值（最具体的赢）
      return {
        ...base,
        ...(o.post && typeof o.post === 'object' ? o.post : {}),
        ...(postExtra && typeof postExtra === 'object' ? postExtra : {}),
      };
    },
  };
}
