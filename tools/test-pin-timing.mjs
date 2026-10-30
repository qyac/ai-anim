// `solveTiming` 的「钉住上一版时长」（BACKLOG 1-23）离线回归 —— 纯 JS，不需要 TTS / GPU。
//
// 钉住要回答的问题只有一个：**改一句词，时间线会不会整条挪位**。
// 判据：同 id 且新旁白放得下 ⇒ stretch / slot 与上一版**逐位相等**（时间线不动）；
//       放不下 ⇒ 只重解这一段并给出「长了多少」的警告；其余段仍然钉住。
//
//   node tools/test-pin-timing.mjs
import assert from 'node:assert/strict';

const { solveTiming } = await import('../scripts/lib/say.mjs');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '\n          → ' + detail : '')); }
};

const scene = (id, internal, lines) => ({
  id, internal,
  lines: lines.map(([cue, dur, text]) => ({ cue, dur, text: text ?? ('t-' + cue) })),
});
const baseArgs = { beat: 0.5, overlap: 0.5, tail: 1.2, maxStretch: 1.9 };

console.log('solveTiming 的 --pin-timing（BACKLOG 1-23）回归：');

console.log('\n§1 不钉时照常解');
const a = solveTiming({ ...baseArgs, scenes: [scene('s1', 4.2, [[0.6, 1.2]])] });
check('返回 pinned / resolved 两个数组', Array.isArray(a.pinned) && Array.isArray(a.resolved));
check('不钉时 pinned 为空', a.pinned.length === 0 && a.resolved.length === 0, JSON.stringify(a));
const aSlot = a.scenes[0].slot;

console.log('\n§2 钉住：同 id 且放得下 ⇒ slot / stretch 逐位相等');
const prev = [{ id: 's1', slot: aSlot, stretch: a.scenes[0].stretch, internal: 4.2 }];
const b = solveTiming({ ...baseArgs, scenes: [scene('s1', 4.2, [[0.6, 1.2]])], pinned: prev });
check('slot 与上一版相等', b.scenes[0].slot === aSlot, JSON.stringify([b.scenes[0].slot, aSlot]));
check('stretch 与上一版相等', b.scenes[0].stretch === a.scenes[0].stretch);
check('被记进 pinned', b.pinned.join(',') === 's1', JSON.stringify(b.pinned));
check('总时长与不钉时相等（时间线不动）', b.total === a.total, JSON.stringify([b.total, a.total]));

console.log('\n§3 钉住时旁白变短也算放得下（沿用旧 slot，不缩）');
const c = solveTiming({ ...baseArgs, scenes: [scene('s1', 4.2, [[0.6, 0.4]])], pinned: prev });
check('短了也钉住（slot 不变）', c.scenes[0].slot === aSlot && c.pinned.length === 1);

console.log('\n§4 放不下 ⇒ 只重解这一段 + 说清长多少');
const d = solveTiming({ ...baseArgs, scenes: [scene('s1', 4.2, [[0.6, 6.0]])], pinned: prev });
check('这一段没被钉住', d.pinned.length === 0 && d.resolved.join(',') === 's1', JSON.stringify([d.pinned, d.resolved]));
check('slot 变大了（重解生效）', d.scenes[0].slot > aSlot, JSON.stringify([d.scenes[0].slot, aSlot]));
check('警告里点名段 id 与超出量', d.warnings.some((w) => w.includes('[s1]') && /放不进原来的 slot/.test(w)),
  JSON.stringify(d.warnings));

console.log('\n§5 部分钉住：两段里只钉住没变的那段');
const sc2 = [scene('keep', 4.2, [[0.6, 1.0]]), scene('grow', 4.2, [[0.6, 1.0]])];
const e0 = solveTiming({ ...baseArgs, scenes: sc2 });
const pin2 = e0.scenes.map((s) => ({ id: s.id, slot: s.slot, stretch: s.stretch, internal: s.internal }));
const e1 = solveTiming({
  ...baseArgs,
  scenes: [scene('keep', 4.2, [[0.6, 1.0]]), scene('grow', 4.2, [[0.6, 6.0]])],
  pinned: pin2,
});
check('keep 被钉住、grow 被重解', e1.pinned.join(',') === 'keep' && e1.resolved.join(',') === 'grow',
  JSON.stringify([e1.pinned, e1.resolved]));
check('keep 的 slot 没动', e1.scenes[0].slot === e0.scenes[0].slot);

console.log('\n§6 边界');
check('pinned 缺 id / slot<=0 时当没给', (() => {
  const x = solveTiming({ ...baseArgs, scenes: [scene('s1', 4.2, [[0.6, 1.2]])], pinned: [{ id: 's1', slot: 0, stretch: 0 }] });
  return x.pinned.length === 0;
})());
check('pinned 为 null 时照常解', solveTiming({ ...baseArgs, scenes: [scene('s1', 4.2, [[0.6, 1.2]])], pinned: null }).pinned.length === 0);
check('pinned 里有不存在的 id ⇒ 不影响，也不报错', (() => {
  const x = solveTiming({ ...baseArgs, scenes: [scene('s1', 4.2, [[0.6, 1.2]])], pinned: [{ id: 'gone', slot: 9, stretch: 2 }] });
  return x.pinned.length === 0 && x.scenes.length === 1;
})());

console.log(fail ? '\n✗ 有 ' + fail + ' 项失败' : '\n✓ 全部通过（' + pass + ' 项）');
process.exitCode = fail ? 1 : 0;