// 终极验收：直接看**应用自己渲染出来的一帧**在 SCALE=2 下有没有矢量线条。
// 不再手工搭 GL 环境（那套探针自己引入了一堆干扰），只看 png()/readPixels 的真实结果。
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, startVite, launchBrowser, gotoProbe } from './lib/probe-page.mjs';

const vite = await startVite(5414);
const browser = await launchBrowser();
mkdirSync(path.join(ROOT, 'out', '_calib', 'scale'), { recursive: true });

for (const scale of [1, 2]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await gotoProbe(page, { url: vite.url, task: '_calib', scale });
  // xf 场景 t=12.0 是 xa 段（有网格线 + 白色边框 + 方块）：矢量最密集的一帧
  const r = await page.evaluate(async () => {
    const api = window.__anim;
    const boot = await api.boot;
    const e = boot.engine;
    await api.frame(12.0, { samples: 1 });
    const png = api.png();
    const px = e.readPixels();
    const W = e.gl.pw, H = e.gl.ph;
    // 数"亮像素"：白边框/方块/文字都算；再数一次"中等亮度"（网格线）
    let bright = 0, mid = 0, maxV = 0;
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(px[i], px[i + 1], px[i + 2]);
      if (v > maxV) maxV = v;
      if (v > 180) bright++;
      else if (v > 60) mid++;
    }
    return {
      scale: e.gl.scale, W, H,
      brightPixels: bright, midPixels: mid, maxV,
      errors: e.errors.slice(0, 5),
      png,
    };
  });
  writeFileSync(path.join(ROOT, 'out', '_calib', 'scale', `app_scale${scale}.png`), Buffer.from(String(r.png).split(',')[1], 'base64'));
  console.log(`\n=== scale ${r.scale} (${r.W}×${r.H}) ===`);
  console.log(`  亮像素(>180) ${r.brightPixels}   中亮像素(60..180) ${r.midPixels}   最亮 ${r.maxV}`);
  console.log(`  引擎错误: ${JSON.stringify(r.errors)}`);
  console.log(`  浏览器错误: ${errs.length ? errs.slice(0, 3).join(' | ') : '(无)'}`);
  console.log(`  图: out/_calib/scale/app_scale${scale}.png`);
  await page.close();
}
await browser.close();
vite.stop();
