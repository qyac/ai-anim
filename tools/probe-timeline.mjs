// 诊断：页面实际加载到的时间线是什么（段 id / 起止 / 源文件）
import { openProbePage } from './lib/probe-page.mjs';

const TASK = process.argv[2] ?? '_calib';

const { page, close } = await openProbePage({ task: TASK, port: 5402 });

const r = await page.evaluate(async () => {
  const api = window.__anim;
  const boot = await api.boot;
  const e = boot.engine;
  const probe = [];
  for (const t of [1.1, 1.7, 2.7, 3.7]) {
    await api.frame(t, { samples: 1 });
    const px = e.readPixels();
    const i = ((e.gl.ph / 2 | 0) * e.gl.pw + 300) * 4;
    probe.push({ t, px: [px[i], px[i + 1], px[i + 2]] });
  }
  return {
    task: api.info().task,
    timeline: e.timeline.map((i) => ({ id: i.id, start: i.start, end: i.end })),
    duration: e.duration,
    errors: e.errors,
    probe,
  };
});
console.log(JSON.stringify(r, null, 2));
await close();
