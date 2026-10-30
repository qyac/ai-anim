// infoShot 段落骨架（BACKLOG 1-50）的离线回归 —— 纯 JS，不需要 GPU。
//
// 钉三件事：
//   §1 工厂返回普通场景对象（{ id, render }，能直接进时间线）；
//   §2 focus 声明的形状（默认近似矩形 / noFocus: true 时为 null）；
//   §3 draw 抛错不吞（转成 ctx.warnings，画面继续出）+ post 合并（draw 返回值优先）。
//
//   node tools/test-info.mjs
import assert from 'node:assert/strict';

const { infoShot } = await import('../src/kit/info.js');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '\n          → ' + detail : '')); }
};

console.log('infoShot 段落骨架（src/kit/info.js）回归：');

/* ── §1 场景对象形状 ─────────────────────────────────────────── */
console.log('\n§1 工厂返回普通场景对象');
const s = infoShot('t', { draw() {} });
check('有字符串 id', typeof s.id === 'string' && s.id === 't');
check('有 render 函数', typeof s.render === 'function');
check('每次调用是新对象', infoShot('t', { draw() {} }) !== s);

/* ── §2 focus 声明 ───────────────────────────────────────────── */
console.log('\n§2 focus 声明（版面守门读段上的 focus）');
const f = infoShot('f', { draw() {} }).focus;
check('默认声明 focus（近似矩形）', f && typeof f === 'object' && f.x > 0 && f.w > 0 && f.h > 0);
check('focus.source 标记来源', f.source === 'info');
const nf = infoShot('b', { noFocus: true, draw() {} }).focus;
check('noFocus: true 时不声明（守门报"没判"，不是假装通过）', nf == null);

/* ── §3 draw 的容错与 post 合并 ─────────────────────────────── */
console.log('\n§3 draw 容错与 post 合并');
{
  const warnings = [];
  const boom = infoShot('boom', { draw() { throw new Error('炸了'); } });
  const ctx = {
    f: { lt: 3, t: 3 }, gl: { W: 1920, H: 1080, w: 1920, h: 1080, clear() {} },
    P: { ink: [0, 0, 0], ink2: [0, 0, 0], signal: [1, .3, .1], bone: [1, 1, 1], ash: [.6, .6, .6], graphite: [.4, .4, .4] },
    text: { clear() {}, upload() {} }, type: { write() {}, writeLine() {} }, comp: { draw() {} },
    lines: { begin() {}, seg() {}, flush() { return 0; }, fillRect() {}, rect() {}, circle() {} },
    grid: null, world: { __pass: true }, warnings,
  };
  let threw = false;
  try { boom.render(ctx); } catch (e) { threw = true; }
  check('draw 抛错不冒泡（骨架吞掉）', !threw);
  check('抛错进了 ctx.warnings（check 会打印）', warnings.some((w) => w.includes('炸了')));
}
{
  const merged = infoShot('m', {
    post: { bloom: 0.5, grain: 0.1 },
    draw() { return { bloom: 0.9 }; },   // draw 的返回值覆盖骨架/段 post 的同名键
  });
  const ctx = {
    f: { lt: 3, t: 3 }, gl: { W: 1920, H: 1080, w: 1920, h: 1080, clear() {} },
    P: { ink: [0, 0, 0], ink2: [0, 0, 0], signal: [1, .3, .1], bone: [1, 1, 1], ash: [.6, .6, .6], graphite: [.4, .4, .4] },
    text: { clear() {}, upload() {} }, type: { write() {}, writeLine() {} }, comp: { draw() {} },
    lines: { begin() {}, seg() {}, flush() { return 0; }, fillRect() {}, rect() {}, circle() {} },
    grid: null, world: null, warnings: [],
  };
  const post = merged.render(ctx);
  check('post 合并：draw 的 bloom 覆盖段 post（0.9）', post.bloom === 0.9);
  check('post 合并：段 post 的 grain 保留（0.1）', post.grain === 0.1);
  check('post 合并：骨架默认 vignette 在', typeof post.vignette === 'number');
}

console.log(fail ? '\n✗ 有 ' + fail + ' 项失败' : '\n✓ 全部通过（' + pass + ' 项）');
process.exitCode = fail ? 1 : 0;
