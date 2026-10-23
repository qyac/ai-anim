// 一次性诊断脚本：标定「引擎导出」与「浏览器显示」两条路径的色彩空间。
// 用法：node tools/probe-colorspace.mjs [task] [url]
import { openProbePage } from './lib/probe-page.mjs';

const TASK = process.argv[2] ?? '_calib';
const url = process.argv[3] ?? '';

const { page, status, close } = await openProbePage({ task: TASK, url, port: 5399 });
console.log('status:', JSON.stringify(status));

const r = await page.evaluate(async () => {
  const api = window.__anim;
  const boot = await api.boot;
  const engine = boot.engine;
  const out = [];
  const cv = document.createElement('canvas');
  for (const t of [0, 1, 2]) {
    await api.frame(t, { samples: 1 });
    const lin = engine.readPixels();                      // 导出路径读到的（自下而上）
    cv.width = engine.gl.pw; cv.height = engine.gl.ph;
    const cc = cv.getContext('2d');
    cc.drawImage(engine.gl.canvas, 0, 0);                  // 浏览器显示出来的
    const disp = cc.getImageData(0, 0, cv.width, cv.height).data;
    const i = ((cv.height / 2 | 0) * cv.width + 8) * 4;
    out.push({ t, export: [lin[i], lin[i + 1], lin[i + 2]], display: [disp[i], disp[i + 1], disp[i + 2]] });
  }
  return { size: [engine.gl.pw, engine.gl.ph], frames: out };
});
console.log(JSON.stringify(r, null, 2));
await close();
