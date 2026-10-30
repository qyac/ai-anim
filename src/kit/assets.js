// @ts-check
/**
 * `src/kit/assets.js` —— **共享素材加载器**（`assets/manifest.json` 的唯一读者）。
 *
 * 三条原则（与引擎的确定性契约一致，见 docs/ASSETS.md 层 2）：
 *   1. **只能在 `setup()` 里加载**（可以 `async setup`）：`render(t)` 是纯函数，里面不许有 IO；
 *   2. **失败画占位，不许崩**：缺图 / 缺字段 → 返回 `null` 并 push 一条警告，场景照常出片；
 *   3. **同 id 只加载一次**（进程内缓存），**不发网络请求** —— 素材必须已经在仓库里。
 *
 * ```js
 * import { loadAsset, drawAsset } from '../kit/assets.js';
 * async setup(ctx) { this.logo = await loadAsset(ctx, 'nekohome-logo'); }
 * render(ctx) { drawAsset(ctx, this.logo, [x, y, w, h], { opacity: 0.95 }); }
 * ```
 */

/** manifest 缓存（每个页面一份） */
let MANIFEST = null;
/** 纹理缓存：id → { tex, w, h } | null */
const CACHE = new Map();

/** 必填字段：缺一个就加载失败（不是警告），见 docs/ASSETS.md */
export const REQUIRED_FIELDS = ['id', 'path', 'kind', 'license', 'source'];

/** 读并校验 manifest（第一次调用时读，之后走缓存） */
export async function loadManifest(ctx) {
  if (MANIFEST) return MANIFEST;
  const url = new URL('../../assets/manifest.json', import.meta.url).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error('读不到 assets/manifest.json（' + res.status + '）');
  const j = await res.json();
  const broken = [];
  for (const a of j.assets ?? []) {
    for (const f of REQUIRED_FIELDS) if (!a[f]) broken.push((a.id || '(无 id)') + ' 缺字段 ' + f);
  }
  if (broken.length) throw new Error('assets/manifest.json 不合法：' + broken.join('；'));
  MANIFEST = j;
  return j;
}

/** 把一个 Image 传成纹理（与 tasks 里手写的那套一致：sRGB + CLAMP） */
function imageToTex(ctx, im) {
  const g = ctx.gl.ctx;
  const tex = g.createTexture();
  g.bindTexture(g.TEXTURE_2D, tex);
  g.texImage2D(g.TEXTURE_2D, 0, g.SRGB8_ALPHA8, g.RGBA, g.UNSIGNED_BYTE, im);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  return { tex, __tex: true, w: im.naturalWidth, h: im.naturalHeight };
}

/**
 * 按 id 加载共享素材。成功返回 `{ tex, w, h, id }`，失败返回 `null` 并记一条警告。
 * @param {any} ctx 场景 ctx（要用 ctx.gl 与 ctx.warnings）
 * @param {string} id manifest 里的 id
 */
export async function loadAsset(ctx, id) {
  if (CACHE.has(id)) return CACHE.get(id);
  let entry = null;
  try {
    const m = await loadManifest(ctx);
    entry = (m.assets ?? []).find((a) => a.id === id) ?? null;
  } catch (err) {
    warn(ctx, '素材库读不了：' + (err && err.message ? err.message : err));
    CACHE.set(id, null);
    return null;
  }
  if (!entry) {
    warn(ctx, '素材库里没有 id=' + id + '（可用：' + ((MANIFEST?.assets ?? []).map((a) => a.id).join(' / ') || '空') + '）');
    CACHE.set(id, null);
    return null;
  }
  const im = new Image();
  im.src = new URL('../../assets/' + entry.path, import.meta.url).href;
  const got = await new Promise((resolve) => {
    im.onload = () => resolve(imageToTex(ctx, im));
    im.onerror = () => resolve(null);
  });
  if (!got) warn(ctx, '素材文件加载失败：' + entry.path + '（' + id + '）');
  const out = got ? { ...got, id } : null;
  CACHE.set(id, out);
  return out;
}

/**
 * 画素材：`rect = [x, y, w, h]`，等比铺满（不拉伸）。素材缺失时画虚线占位框。
 * @param {any} ctx @param {any} asset loadAsset 的返回值
 */
export function drawAsset(ctx, asset, rect, opts = {}) {
  const { gl, comp, lines, P } = ctx;
  const [x, y, w, h] = rect;
  if (!asset) {
    // 占位：虚线框 + 交叉线（一眼看出「这里该有素材但没加载到」）
    const col = [P.signal[0], P.signal[1], P.signal[2], 0.5];
    const step = 14;
    for (let i = 0; i < w; i += step) lines.seg(x + i, y, Math.min(x + i + step / 2, x + w), y, 1.4, col);
    for (let i = 0; i < w; i += step) lines.seg(x + i, y + h, Math.min(x + i + step / 2, x + w), y + h, 1.4, col);
    for (let i = 0; i < h; i += step) lines.seg(x, y + i, x, Math.min(y + i + step / 2, y + h), 1.4, col);
    for (let i = 0; i < h; i += step) lines.seg(x + w, y + i, x + w, Math.min(y + i + step / 2, y + h), 1.4, col);
    lines.seg(x, y, x + w, y + h, 1.2, col);
    lines.seg(x + w, y, x, y + h, 1.2, col);
    return false;
  }
  const sc = Math.min(w / asset.w, h / asset.h);
  const dw = asset.w * sc, dh = asset.h * sc;
  comp.draw(gl, asset, ctx.out, {
    rect: [x + (w - dw) / 2, y + (h - dh) / 2, dw, dh],
    opacity: opts.opacity ?? 1,
  });
  return true;
}

function warn(ctx, msg) {
  if (ctx && Array.isArray(ctx.warnings)) ctx.warnings.push(msg);
  else console.warn('[assets] ' + msg);
}
