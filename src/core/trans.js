// @ts-check
/**
 * 转场与「一镜到底」工具。
 *
 * 这一层解决的是一个**剪辑问题**，不是渲染问题：为什么大多数代码动画一眼看去就是
 * 「一段一段的幻灯片」？因为每个场景各建背景、各写 post，一切镜头世界就跳；
 * 切点还配上 flash+zoom，于是每次切换都在"顿"一下。
 *
 * 有效的配方（在 NekoHome 那支 48 秒片子上验证过）是四条，缺一条就会露馅：
 *
 *   ① **全片只有一层背景**：同一个 shader、参数只由**整片时间 `f.t`** 驱动，
 *      所以切点两侧的背景逐像素一致 —— 世界没有变，只有前景在换。
 *   ② **全片一台摄影机**：`cameraAt(t)` 交给 post 的 `zoom`/`shake`，
 *      全帧（背景 + 矢量 + 文字）一起动，切镜头时它不会断。
 *   ③ **一个走完全片的母题**：一条指针/一道扫描线/一颗星，眼睛有得跟，切了也像没切。
 *   ④ **交叠期把上一帧甩走**，不是原地淡出：`transitionPass()` 沿摄影机方向加速推出去
 *      并加方向拖尾；新内容从**反方向**落位（`enterOffset`）。
 *
 * 用法（每段场景的骨架）：
 *
 * ```js
 * import { makeTransitionKit, cameraAt, cameraDir, cameraPost, enterOffset } from '../../../src/core/trans.js';
 *
 * export default {
 *   id: 'shot_a',
 *   handlesTransition: true,                  // 转场自己处理，别让引擎做交叉溶解
 *   setup(ctx) { this.tk = makeTransitionKit(ctx); },
 *   render(ctx) {
 *     const { f, gl, lines, text, type } = ctx;
 *     const k = this.tk.openFrame(ctx, this.worldPass);   // 画全片唯一的背景 + 甩走上一帧；返回入场进度
 *     // …画这一段的 foreground（用 enterOffset(f.t, k) 做反向落位）…
 *     return cameraPost(f.t, { bloom: 0.34, grain: 0.02 });
 *   },
 * };
 * ```
 *
 * ⚠ **文字量大的画面不要用交叉溶解**：两屏字叠在一起会糊，必须让旧的「走掉」——
 * 这正是 `transitionPass` 存在的理由。
 */

import { Pass } from './gl.js';
import { sat } from './util.js';

/**
 * 把「上一段那一帧」沿摄影机方向甩出去，并加方向拖尾。
 *
 * 与交叉溶解的区别：溶解是「两张图叠在一起」，甩出去是「镜头没停，画面被带走了」。
 * 位移随 k **加速**（k²），拖尾宽度同时变宽 —— 这两个一起给速度感；
 * 透明度在 k=0.55 之前就降到 0，避免两屏文字长时间叠着。
 *
 * 返回的 `Pass` 是 `blend: true` 的：它是**叠在本段背景之上**的，不是覆盖。
 *
 * @param {import('./gl.js').GL} gl
 * @param {{ push?: number, blur?: number, fadeAt?: number, samples?: number, key?: string }} [opts]
 */
export function transitionPass(gl, opts = {}) {
  const push = opts.push ?? 0.36;
  const blur = opts.blur ?? 0.085;
  const fadeAt = opts.fadeAt ?? 0.55;
  return new Pass(gl, /* glsl */ `
    uniform sampler2D under;
    uniform float k;
    uniform vec2 dir;
    uniform float push, blur, fadeAt;
    void main() {
      vec2 uv = vUv;
      float kk = clamp(k, 0.0, 1.0);
      // 位移随 k 加速，拖尾同时变宽 = 速度感
      float p = push * kk * kk;
      float b = 0.018 + blur * kk;
      vec2 uv2 = clamp(uv - dir * p, vec2(0.001), vec2(0.999));
      vec3 acc = vec3(0.0);
      float wsum = 0.0;
      for (int i = 0; i < 10; i++) {
        float f = float(i) / 9.0;
        float w = 1.0 - abs(f - 0.5) * 0.9;
        acc += texture(under, clamp(uv2 + dir * (f - 0.5) * b, vec2(0.001), vec2(0.999))).rgb * w;
        wsum += w;
      }
      // 前半程就送走，别让两屏文字长时间叠着
      float a = 1.0 - smoothstep(0.0, max(0.02, fadeAt), kk);
      fragColor = vec4(acc / wsum, a);
    }`, { under: { value: null }, k: 1, dir: [1, 0], push, blur, fadeAt },
  { key: opts.key ?? 'trans_push', blend: true });
}

/**
 * 摄影机曲线的**参数化实现**。
 *
 * `src/core/trans.js`（老配方）与 `src/kit/world.js`（`makeShot` 用的那套）是
 * **同一个纯函数的两组参数**，不是两份实现 —— 以前两处各抄一份，改一处就会漏另一处。
 * 默认值 = `trans.js` 从前的常量（逐像素不变）；`kit/world.js` 传另一组。
 *
 * 返回 `{ cameraAt, cameraDir, cameraPost, enterOffset }`，全部只吃 `t`。
 *
 * @param {{
 *   zoomBase?: number, zoomAmp?: number,
 *   zoomW?: [number, number], zoomPhase?: [number, number],
 *   shake?: [number, number, number][],   // [幅度, 频率, 相位] × 4：x 两路、y 两路
 *   enterAmount?: number, enterY?: number,
 * }} [p]
 */
export function makeCameraProfile(p = {}) {
  const zoomBase = p.zoomBase ?? 1;
  const zoomAmp = p.zoomAmp ?? 0.05;
  const zoomW = p.zoomW ?? [0.105, 0.31];
  const zoomPhase = p.zoomPhase ?? [0, 2.0];
  const shake = p.shake ?? [[38, 0.19, 0], [13, 0.47, 0.7], [22, 0.16, 1.3], [8, 0.41, 0]];
  const enterAmount = p.enterAmount ?? 150;
  const enterY = p.enterY ?? 0.55;

  /**
   * 全片一台摄影机：**只用整片时间 `t`**，所以切镜头时它不会断。
   * 两个不同频率的正弦叠加，避免看出周期。
   */
  function cameraAt(t, opts = {}) {
    const zAmp = opts.zoomAmp ?? zoomAmp;
    const sAmp = opts.shakeAmp ?? 1;
    const zBase = opts.zoomBase ?? zoomBase;
    return {
      zoom: zBase + zAmp * Math.sin(t * zoomW[0] + zoomPhase[0])
        + zAmp * 0.4 * Math.sin(t * zoomW[1] + zoomPhase[1]),
      shake: [
        sAmp * (shake[0][0] * Math.sin(t * shake[0][1] + shake[0][2])
          + shake[1][0] * Math.sin(t * shake[1][1] + shake[1][2])),
        sAmp * (shake[2][0] * Math.sin(t * shake[2][1] + shake[2][2])
          + shake[3][0] * Math.sin(t * shake[3][1] + shake[3][2])),
      ],
    };
  }

  /**
   * 摄影机当前的运动方向（单位向量，屏幕坐标系 y 向下）。
   * 用有限差分从 `cameraAt` 推出来 —— 转场拖尾与前景入场都沿它，动感才接得上。
   */
  function cameraDir(t, dt = 0.05, opts = {}) {
    const a = cameraAt(t - dt, opts), b = cameraAt(t + dt, opts);
    const dx = b.shake[0] - a.shake[0];
    const dy = b.shake[1] - a.shake[1];
    const n = Math.hypot(dx, dy) || 1;
    return [dx / n, dy / n];
  }

  /**
   * 段落收尾用的 post：摄影机 + 这一段的固定观感，合成一个对象直接 return。
   * @param {number} t 整片时间（`f.t`，不是 `f.lt`）
   * @param {Record<string, any>} [extra] 这一段自己的调色/泛光等
   */
  function cameraPost(t, extra = {}) {
    return { ...cameraAt(t), ...extra };
  }

  /**
   * 前景的入场位移：方向与摄影机**相反**（上一镜往这边被甩走，新内容就从反方向落位）。
   * 直接加在文字的 x/y 或矢量的坐标上即可。
   *
   * @param {number} t 整片时间
   * @param {number} k 入场进度（0 = 刚进来，1 = 站稳）
   * @param {number} [amount] 最大位移（逻辑像素）
   * @returns {[number, number]} `[dx, dy]`
   */
  function enterOffset(t, k, amount = enterAmount) {
    const d = cameraDir(t);
    const rem = (1 - sat(k)) ** 2;
    return [-d[0] * amount * rem, -d[1] * amount * enterY * rem];
  }

  return { cameraAt, cameraDir, cameraPost, enterOffset };
}

/** `trans.js` 这一套（老配方）的默认参数 —— 就是从前写死在这里的那组数。 */
const CAM = makeCameraProfile();

export const cameraAt = CAM.cameraAt;
export const cameraDir = CAM.cameraDir;
export const cameraPost = CAM.cameraPost;
export const enterOffset = CAM.enterOffset;

/**
 * 交叠期那一帧：先铺共享背景（如果要），再把上一段沿**这一套摄影机**的方向甩走。
 * `makeTransitionKit` 与 `kit/world.js` 的 `makeWorldKit` 共用这一份。
 *
 * @param {any} c SceneCtx
 * @param {{ pass: any, background?: any, opts?: any,
 *           dir: (t: number, dt?: number, opts?: any) => number[] }} o
 * @returns {number} 入场进度 k
 */
export function openTransitionFrame(c, o) {
  const { f, gl } = c;
  const { pass, background, dir } = o;
  if (background) background.render(gl, c.out, f.t, f.dt);
  // ctx.under 只有「自己声明了 handlesTransition 且真的在交叠」时才非空
  const k = c.under ? sat(f.tin) : 1;
  if (c.under && k < 1) {
    const u = pass.u;
    u.under.value = { tex: /** @type {any} */ (c.under).tex ?? c.under, __tex: true };
    u.k.value = k;
    u.dir.value = dir(f.t, 0.05, o.opts);
    pass.render(gl, c.out, f.t, f.dt);
  }
  return k;
}

/**
 * 场景侧的转场套件。一句 `this.tk = makeTransitionKit(ctx)` 装好，
 * 每帧第一句 `const k = this.tk.openFrame(ctx)` 就没别的事了。
 */
export function makeTransitionKit(ctx, opts = {}) {
  const pass = transitionPass(ctx.gl, opts);
  return {
    pass,
    /**
     * 每帧第一句：画全片唯一的背景（如果要），并在交叠期把上一段甩出去。
     * @param {import('./scene.js').SceneCtx} c
     * @param {{ render: (gl: any, target: any, t: number, dt: number) => any } | null} [background]
     *        全片共用的背景 Pass（**整片同一张**，参数只跟 `f.t` 走）
     * @returns {number} 入场进度 k（1 = 已经站稳，可以按平常那样画）
     */
    openFrame(c, background = null) {
      return openTransitionFrame(c, { pass, background, dir: cameraDir, opts });
    },
  };
}
