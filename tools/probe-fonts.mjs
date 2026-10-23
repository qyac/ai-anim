// P1-3 验收：任务自带字体（task.fonts）真的被浏览器加载、且真的被用上了。
//
// 判据两条：
//   ① document.fonts 里能查到声明的 family，且 check() 为 true（文件确实下下来了）
//   ② 用该 family 量同一串字的宽度，必须**不等于**回退字体的宽度
//      （宽度不同 = 真的换了字形；相等说明静默回退了）
import { openProbePage } from './lib/probe-page.mjs';

const TASK = process.argv[2] ?? '_calib';
const logs = [];

const { page, close } = await openProbePage({
  task: TASK, port: 5403,
  onPageError: (e) => logs.push('pageerror: ' + e.message),
  onPage: (p) => p.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`)),
});

const r = await page.evaluate(async () => {
  const c = document.createElement('canvas').getContext('2d');
  const measure = (font) => { c.font = font; return c.measureText('NekoHome 动画 0123').width; };
  const mine = measure('600 64px "BrandFont"');
  const fallback = measure('600 64px monospace-not-installed-xyz, sans-serif');
  const bogus = measure('600 64px "NoSuchFontAnywhere12345", sans-serif');
  return {
    familyCheck: document.fonts.check('600 64px "BrandFont"'),
    hasFace: [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'BrandFont'),
    faces: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`),
    widthMine: mine,
    widthFallback: fallback,
    widthBogus: bogus,
    differs: Math.abs(mine - fallback) > 0.5,
    differsFromBogus: Math.abs(mine - bogus) > 0.5,
    styleTag: !!document.querySelector('style[data-anim-task-fonts]'),
  };
});
console.log(JSON.stringify(r, null, 2));
console.log('--- console ---\n' + logs.filter((l) => /font/i.test(l)).join('\n'));
await close();
const pass = r.familyCheck && r.hasFace && r.differs;
console.log(`\n判定：${pass ? 'PASS ✓ 任务字体确实加载并生效' : 'FAIL ✗'}`);
process.exit(pass ? 0 : 1);
