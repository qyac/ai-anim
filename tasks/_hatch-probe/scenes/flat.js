// @ts-check
/**
 * 排线探针的场景：三块**纯平**的灰（没有任何周期性底纹）。
 *
 * 明度分别落在三档门槛里：
 *   浅灰 0.62 → dark 0.38 → 只有第 0 层（一道线）
 *   中灰 0.42 → dark 0.58 → 第 0 + 1 层（交叉两道）
 *   深灰 0.16 → dark 0.84 → 三层（cross-hatching）
 *
 * ⚠ `fillRect` 的 step 给 **8**（不是 2）：行距太细的话，排线自身的采样会与它拍频，
 *   探针就变成在测"两个周期怎么打架"，而不是测"同一块灰上排线均匀不均匀"。
 */
export default {
  id: 'bands',
  focus: 'center',
  render(ctx) {
    const { gl, lines, W, H } = ctx;
    gl.clear(ctx.out, [0.86, 0.86, 0.86]);
    lines.begin();
    lines.fillRect(0, H * 0.15, W / 3, H * 0.7, [0.62, 0.62, 0.62], 8);
    lines.fillRect(W / 3, H * 0.15, W / 3, H * 0.7, [0.42, 0.42, 0.42], 8);
    lines.fillRect((W * 2) / 3, H * 0.15, W / 3, H * 0.7, [0.16, 0.16, 0.16], 8);
    lines.flush(ctx.out);
    return { bloom: 0, grain: 0, vignette: 0 };
  },
};
