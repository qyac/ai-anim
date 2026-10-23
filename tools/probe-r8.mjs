// @ts-check
/**
 * 量具：R8 / RG8 渲染目标 + readPixels(RED/RG, UNSIGNED_BYTE) 在 ANGLE 上到底能不能用。
 *
 *   node tools/probe-r8.mjs
 *
 * 为什么需要它：改造前 readNV12() 把 Y 平面（w×h 单字节）按 RGBA 回读（8.29MB）、UV 也按
 * RGBA 回读（2.07MB），再在 CPU 上抽成 1 字节/像素。若把两个平面建成 R8 / RG8 目标、
 * 按 RED/RG 回读，总回读降到 3.11MB 且紧凑化循环整个消失
 * （docs/BACKLOG.md 1-7 ⓐ / docs/PERF.md §5.6 第 5 条）。
 *
 * GLES3 表 3.2 允许 R8/RG8 纹理，但 ANGLE（Chrome 的 GL 翻译层）对 readPixels(RED/RG)
 * 的实现是否完整没有文档保证。失败形态可能是：framebuffer incomplete /
 * readPixels 抛 GL_INVALID_OPERATION / 回读全 0 —— 三种都不会让渲染报错，只会让成片
 * 整片变黑或偏色。所以这一刀必须先问它。
 *
 * 判据（与 tools/probe-nv12.mjs 同口径）：把同一个图案分别渲进 R8/RG8 与 RGBA8，
 * 按各自 layout 回读，逐字节比 —— 差 >1 的字节必须为 0。图案同时覆盖对齐宽度（32）
 * 与非 4 对齐宽度（13，会暴露 PACK_ALIGNMENT 的行填充），两种宽度都要过。
 *
 * 结局（退出码）：
 *   0 = R8 + RG8 都过 → 直接换（docs/history/HANDOFF-R8RG8.md §2.1/§2.2）
 *   2 = 只有 R8 过     → 只换 Y 平面（占回读量的大头）
 *   1 = 都不过         → readNV12 保留 RGBA + 紧凑化，并在门口加能力检测
 *
 * ⚠ 必须在无头 Chrome 里跑（和 probe-nv12 一样走 Vite + __anim），要测的正是 ANGLE 的
 *   行为；Node 里的软件 GL 不算数。
 */
import { openProbePage } from './lib/probe-page.mjs';

const TASK = process.argv[2] ?? '_calib';

const { page, close } = await openProbePage({ task: TASK, url: process.argv[3] ?? '', port: 5403 });

const r = await page.evaluate(async () => {
  const api = /** @type {any} */ (window).__anim;
  const engine = (await api.boot).engine;
  const g = /** @type {WebGL2RenderingContext} */ (engine.gl.ctx);

  const drain = () => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      const e = g.getError();
      if (e === g.NO_ERROR) break;
      out.push('0x' + e.toString(16));
    }
    return out;
  };
  drain();

  // ANGLE 的 renderer 串（记进报告：换机器/换 Chrome 时能对照）
  let renderer = '';
  try {
    const ext = g.getExtension('WEBGL_debug_renderer_info');
    renderer = ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(g.getParameter(g.RENDERER));
  } catch { /* 没扩展就空着 */ }

  // 无顶点缓冲的全屏三角形
  const VS = [
    '#version 300 es',
    'precision highp float;',
    'void main() {',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}',
  ].join('\n');
  // 图案与像素坐标强相关（互质步长）：任何一列的错位、行填充、通道顺序错误都会变成
  // 大面积不一致，而不会像渐变那样"看起来差不多"。
  const FS = [
    '#version 300 es',
    'precision highp float;',
    'uniform int mode;',
    'out vec4 fragColor;',
    'void main() {',
    '  ivec2 p = ivec2(gl_FragCoord.xy);',
    '  float v = float((p.x * 37 + p.y * 67 + 11) & 255) / 255.0;',
    '  float u = float((p.x * 91 + p.y * 23 + 5) & 255) / 255.0;',
    '  if (mode == 0) fragColor = vec4(v, 0.0, 0.0, 1.0);',
    '  else fragColor = vec4(v, u, 0.0, 1.0);',
    '}',
  ].join('\n');
  const sh = (type, src) => {
    const s = g.createShader(type);
    g.shaderSource(s, src);
    g.compileShader(s);
    if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error('shader 编译失败: ' + g.getShaderInfoLog(s));
    return s;
  };
  const prog = g.createProgram();
  g.attachShader(prog, sh(g.VERTEX_SHADER, VS));
  g.attachShader(prog, sh(g.FRAGMENT_SHADER, FS));
  g.linkProgram(prog);
  if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error('program 链接失败: ' + g.getProgramInfoLog(prog));
  const uMode = g.getUniformLocation(prog, 'mode');

  const make = (kind, w, h) => {
    const layout = kind === 'r8' ? g.RED : kind === 'rg8' ? g.RG : g.RGBA;
    const internal = kind === 'r8' ? g.R8 : kind === 'rg8' ? g.RG8 : g.RGBA8;
    const tex = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, tex);
    // 与 RT 一致：LINEAR（R8/RG8 在 GLES3 里是可过滤的）
    g.texImage2D(g.TEXTURE_2D, 0, internal, w, h, 0, layout, g.UNSIGNED_BYTE, null);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    const fbo = g.createFramebuffer();
    g.bindFramebuffer(g.FRAMEBUFFER, fbo);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
    const status = g.checkFramebufferStatus(g.FRAMEBUFFER);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    return { kind, w, h, tex, fbo, status, layout };
  };

  const draw = (tgt, mode) => {
    g.bindFramebuffer(g.FRAMEBUFFER, tgt.fbo);
    g.viewport(0, 0, tgt.w, tgt.h);
    g.disable(g.BLEND);
    g.disable(g.DEPTH_TEST);
    g.disable(g.SCISSOR_TEST);
    g.colorMask(true, true, true, true);
    g.useProgram(prog);
    g.uniform1i(uMode, mode);
    g.drawArrays(g.TRIANGLES, 0, 3);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    return drain();
  };

  const read = (tgt, fmt, align) => {
    const row = fmt === g.RGBA ? tgt.w * 4 : fmt === g.RG ? tgt.w * 2 : tgt.w;
    const stride = Math.ceil(row / align) * align;
    const buf = new Uint8Array(stride * tgt.h);
    g.bindFramebuffer(g.FRAMEBUFFER, tgt.fbo);
    g.pixelStorei(g.PACK_ALIGNMENT, align);
    g.readPixels(0, 0, tgt.w, tgt.h, fmt, g.UNSIGNED_BYTE, buf);
    g.pixelStorei(g.PACK_ALIGNMENT, 4);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    return { buf, stride, w: tgt.w, h: tgt.h, errs: drain() };
  };

  // 逐像素比：a 是 R8/RG8 回读（aCh = 1/2），b 是 RGBA8 回读（4 通道）。
  const cmp = (a, b, aCh, chA, chB) => {
    let max = 0, over1 = 0, sum = 0, n = 0;
    for (let y = 0; y < a.h; y++) {
      for (let x = 0; x < a.w; x++) {
        const ai = y * a.stride + x * aCh + chA;
        const bi = y * b.stride + x * 4 + chB;
        const d = Math.abs(a.buf[ai] - b.buf[bi]);
        if (d > max) max = d;
        if (d > 1) over1++;
        sum += d;
        n++;
      }
    }
    return { max, over1, n, mean: sum / n };
  };

  const out = { renderer, glVersion: String(g.getParameter(g.VERSION)), rows: [] };
  const sizes = [[32, 8], [13, 5]];      // 第二个故意不按 4 对齐
  for (const [w, h] of sizes) {
    const tR = make('r8', w, h);
    const tRG = make('rg8', w, h);
    const tRGBA = make('rgba8', w, h);
    // 三个目标跑**同一段** shader（写 vec4，和 NV12_FRAG 一样）：R8 只落下 R，RG8 落下 R/G。
    // 参考必须是同一段 shader 渲出的 RGBA8 —— 拿 Y 平面（mode 0）当参考会让 G 通道永远是 0。
    const de = { r8: draw(tR, 1), rg8: draw(tRG, 1), rgba8: draw(tRGBA, 1) };

    // 参考：RGBA8 回读（align 4 天然成立）
    const ref = read(tRGBA, g.RGBA, 4);

    // ① R8：PACK_ALIGNMENT=1（readNV12 应当采用的写法）
    const a1 = read(tR, g.RED, 1);
    // ② R8：PACK_ALIGNMENT=4（默认值）—— 非对齐宽度时行会被填充，量出来记进报告
    const a4 = read(tR, g.RED, 4);
    // ③ RG8：PACK_ALIGNMENT=1
    const b1 = read(tRG, g.RG, 1);

    const r1 = cmp(a1, ref, 1, 0, 0);
    const r4 = cmp(a4, ref, 1, 0, 0);
    const g1 = cmp(b1, ref, 2, 0, 0);
    const g2 = cmp(b1, ref, 2, 1, 1);

    out.rows.push({
      w, h,
      fbStatus: [tR.status, tRG.status, tRGBA.status].map((s) => (s === g.FRAMEBUFFER_COMPLETE ? 'complete' : '0x' + s.toString(16))),
      drawErrs: de,
      strides: { r8: a1.stride, r8a4: a4.stride, rg8: b1.stride, rgba8: ref.stride },
      r8: { ...r1, stride: a1.stride, errs: a1.errs },
      r8a4: { ...r4, stride: a4.stride, errs: a4.errs },
      rg8: {
        r: { ...g1, stride: b1.stride, errs: b1.errs },
        g: { ...g2, stride: b1.stride, errs: b1.errs },
      },
    });
    for (const t of [tR, tRG, tRGBA]) {
      g.deleteFramebuffer(t.fbo); g.deleteTexture(t.tex);
    }
    drain();
  }
  g.deleteProgram(prog);
  return out;
});

console.log('');
console.log('任务 ' + TASK + ' · ' + r.glVersion);
console.log('ANGLE renderer: ' + r.renderer);
console.log('');
console.log('同一图案：R8/RG8 回读 vs RGBA8 的 R/G 通道（判据：差 >1 的字节 = 0）');
console.log('  尺寸    目标         FB             行距  max   mean   >1    GL错误   判定');

let r8ok = true, rg8ok = true;
const pad = (s, n) => String(s).padEnd(n);
for (const o of r.rows) {
  const errs = (a) => (a.length ? a.join(',') : '—');
  const line = (label, rr, st, er) => {
    const ok = st === 'complete' && !er.length && rr.over1 === 0;
    const cells = [
      pad(o.w + 'x' + o.h, 7), pad(label, 10), pad(st, 15), pad(rr.stride, 4),
      pad(rr.max, 4), rr.mean.toFixed(3).padStart(6), pad(rr.over1, 4),
      pad(errs(er), 8), ok ? 'PASS' : 'FAIL',
    ];
    console.log('  ' + cells.join(' '));
    return ok;
  };
  const fbOk = (s) => (s === 'complete' ? 'complete' : s);
  const okR8 = line('R8', o.r8, fbOk(o.fbStatus[0]), o.r8.errs);
  line('R8/align4', o.r8a4, fbOk(o.fbStatus[0]), o.r8a4.errs);
  const okRG8r = line('RG8 R', o.rg8.r, fbOk(o.fbStatus[1]), o.rg8.r.errs);
  const okRG8g = line('RG8 G', o.rg8.g, fbOk(o.fbStatus[1]), o.rg8.g.errs);
  console.log('           draw errs: r8=' + errs(o.drawErrs.r8) + ' rg8=' + errs(o.drawErrs.rg8)
    + ' rgba8=' + errs(o.drawErrs.rgba8)
    + '   行距（默认 align4 / align1）：r8 ' + o.strides.r8a4 + ' / ' + o.strides.r8
    + ' · rg8 ' + o.strides.rg8 + ' · rgba ' + o.strides.rgba8);
  if (!okR8) r8ok = false;
  if (!(okRG8r && okRG8g)) rg8ok = false;
}

console.log('');
if (r8ok && rg8ok) {
  console.log('✓ R8 + RG8 都能渲染并按 RED/RG 回读 —— 可以做 §2.1/§2.2（两个平面都换）');
} else if (r8ok) {
  console.log('△ 只有 R8 可用 —— 只换 Y 平面（UV 保留 RGBA + 紧凑化），做「部分过」那一条');
} else {
  console.log('✗ R8/RG8 回读不可用 —— readNV12 保留 RGBA 路径，改为在门口做一次性能力检测');
}

await close();
process.exit(r8ok && rg8ok ? 0 : r8ok ? 2 : 1);
