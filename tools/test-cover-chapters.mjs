// 封面 / 章节（BACKLOG 1-53）的离线回归 —— 纯 JS，不需要 GPU、不需要浏览器。
//
// 钉两件事：
//   §1 planChapters 的三条规则（首段必是 00:00 / 短段并进上一章 / 起点取段自己的 start）；
//   §2 formatChapterTime 的边界（0 / 59.9 / 60 / 3599 / 负数）。
//
//   node tools/test-cover-chapters.mjs
import assert from 'node:assert/strict';

const { planChapters, formatChapterTime } = await import('../scripts/anim.mjs');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '\n          → ' + detail : '')); }
};

const seg = (id, start, end) => ({ id, start, end });

console.log('封面 / 章节（scripts/anim.mjs 的纯函数）回归：');

/* ── §1 planChapters ─────────────────────────────────────────── */
console.log('\n§1 planChapters（章节规划）');
{
  const rows = planChapters([
    seg('hook', 0, 6), seg('body', 6, 14), seg('outro', 14, 18),
  ], 4);
  check('三段都够长 ⇒ 三段各成一章', rows.length === 3, JSON.stringify(rows));
  check('第一章起点是 0', rows[0].start === 0);
  check('章节名取段 id', rows.map((r) => r.name).join(',') === 'hook,body,outro');
  check('起点取段自己的 start（不是累加）', rows[1].start === 6 && rows[2].start === 14);
}
{
  const rows = planChapters([
    seg('hook', 0, 2), seg('main', 2, 12), seg('blip', 12, 13.5), seg('tail', 13.5, 20),
  ], 4);
  check('首段短（2s）也必须是 00:00 的入口', rows[0].name === 'hook' && rows[0].start === 0);
  check('短段(1.5s)不单独成章', !rows.some((r) => r.name === 'blip'), JSON.stringify(rows.map((r) => r.name)));
  check('短段的时长并进上一章（main 10s → 11.5s）', Math.abs(rows.find((r) => r.name === 'main').dur - 11.5) < 1e-9,
    JSON.stringify(rows));
  check('并进后后面那章的起点仍是它自己的 start', rows.find((r) => r.name === 'tail').start === 13.5);
}
{
  const rows = planChapters([seg('only', 3, 9)], 4);
  check('单段：起点被拉到 0（否则平台不认章节）', rows.length === 1 && rows[0].start === 0, JSON.stringify(rows));
}
{
  check('空段表 ⇒ 空章节（不是抛错）', planChapters([]).length === 0);
  check('非数组 ⇒ 空章节（容错）', planChapters(null).length === 0);
  check('minDur 可调：--min 0 时短段也成章', planChapters([seg('a', 0, 1), seg('b', 1, 2)], 0).length === 2);
}

/* ── §2 formatChapterTime ────────────────────────────────────── */
console.log('\n§2 formatChapterTime（mm:ss）');
check('0 → 00:00', formatChapterTime(0) === '00:00');
check('59.9 → 00:59（向下取整，平台惯例）', formatChapterTime(59.9) === '00:59');
check('60 → 01:00', formatChapterTime(60) === '01:00');
check('3599 → 59:59', formatChapterTime(3599) === '59:59');
check('负数夹到 00:00（不让 "-1:-1" 出现在章节里）', formatChapterTime(-3) === '00:00');
check('NaN 夹到 00:00', formatChapterTime(NaN) === '00:00');

console.log(fail ? '\n✗ 有 ' + fail + ' 项失败' : '\n✓ 全部通过（' + pass + ' 项）');
process.exitCode = fail ? 1 : 0;
