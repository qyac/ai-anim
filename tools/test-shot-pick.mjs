// 选型器 `src/shots/pick.js` 的离线回归（BACKLOG 1-62）。与 `test-shots.mjs` 分工：
// 那边管"模板登记与元数据齐全"，这边管**抽签机器本身**——筛的语义、抽的确定性、落空的诊断。
//
// 只读对象：不建 GL、不开浏览器、不渲染任何一帧。挂进 regress-all 的 `unit:shot-pick`。
//
//   node tools/test-shot-pick.mjs
//
// 覆盖：
//   §1 词表与 fits 组合子（缺省放行的语义是这里最容易被改坏的东西）
//   §2 eligibleShots：energy / tags（任一命中）/ exclude / fits 各筛各的，角色锁靠 fits
//   §3 pickShot：同 seed 同结果、权重影响频次、拼错点名、落空给诊断
//   §4 pickSequence：版内不重复、确定性、候选不够点名
//   §5 真镜头库端到端：role-lock / hasMusic 在 200 个 seed 上都不漏
import { pickShot, pickSequence, eligibleShots,
  SHOT_TAGS, SHOT_SLOTS, SHOT_ENERGY,
  contentOk, endingOnly, transitionOnly, musicOk, atMost, within, noScreenshot } from '../src/shots/pick.js';
import { listShots } from '../src/shots/index.js';

let pass = 0;
let fail = 0;
const failed = [];

function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); return true; }
  fail++;
  failed.push(name);
  console.log(`  FAIL  ${name}${detail ? `\n          → ${detail}` : ''}`);
  return false;
}

const threwMsg = (body) => {
  try { body(); return null; } catch (e) { return String(e?.message ?? e); }
};

/** 合成池：四个模板把每条筛选路径都占一个位置。⚠ 角色锁跟真库一样是**每个模板自己的 fits**
 * 带的（contentOk / endingOnly），不是筛选器的隐含行为 —— 所以正文模板也要套 contentOk。 */
const POOL = [
  { name: 'a', w: 1.4, tags: ['data'], energy: '中', fits: (q) => contentOk(q) && atMost(q?.points, 8) },
  { name: 'b', w: 0.7, tags: ['data', 'pop'], energy: '中', fits: contentOk },
  { name: 'c', w: 1.2, tags: ['ending'], energy: '高', fits: endingOnly },
  { name: 'd', w: 1.0, tags: ['flow'], energy: '高', fits: contentOk },
];

console.log('\n§1 词表与 fits 组合子');
check('三张词表都非空且无重复', [SHOT_TAGS, SHOT_SLOTS, SHOT_ENERGY].every((v) => Array.isArray(v) && v.length && new Set(v).size === v.length),
  '词表有重复项或不是数组');
check('contentOk：正文/缺省过，ending/transition 否', contentOk({ slot: 'content' }) === true
  && contentOk({}) === true && contentOk({ slot: 'ending' }) === false && contentOk({ slot: 'transition' }) === false,
  '角色否决语义不对');
check('endingOnly / transitionOnly 只认自己的槽', endingOnly({ slot: 'ending' }) === true
  && endingOnly({}) === false && transitionOnly({ slot: 'transition' }) === true && transitionOnly({ slot: 'content' }) === false,
  '角色锁放错了');
check('musicOk：hasMusic:false 否决、缺省放行、ending 位否决', musicOk({ hasMusic: false }) === false
  && musicOk({}) === true && musicOk({ slot: 'ending' }) === false, 'musicOk 语义不对');
check('atMost / within：缺省放行、越界否决', atMost(null, 8) === true && atMost(9, 8) === false
  && atMost(3, 8) === true && within(null, 3, 8) === true && within(2, 3, 8) === false && within(5, 3, 8) === true,
  '数量条件语义不对');
check('noScreenshot：true 否决、缺省放行', noScreenshot({ hasScreenshot: true }) === false && noScreenshot({}) === true,
  'device 的"有真图就别用"语义不对');

console.log('\n§2 eligibleShots（筛选语义）');
const names = (list, q) => eligibleShots(list, q).map((s) => s.name).join(',');
check('energy 硬筛（中 → a,b）', names(POOL, { energy: '中' }) === 'a,b', names(POOL, { energy: '中' }));
check('energy 硬筛（高 + slot=ending → 只剩 c）', names(POOL, { energy: '高', slot: 'ending' }) === 'c',
  names(POOL, { energy: '高', slot: 'ending' }));
check('tags 任一命中（data → a,b）', names(POOL, { tags: ['data'] }) === 'a,b', names(POOL, { tags: ['data'] }));
check('tags 多个 = 任一命中即可（data/flow → a,b,d）', names(POOL, { tags: ['data', 'flow'] }) === 'a,b,d',
  'tags 变成了 AND 语义（文档写的是 ANY）');
check('exclude 排除', names(POOL, { tags: ['data'], exclude: ['a'] }) === 'b', names(POOL, { tags: ['data'], exclude: ['a'] }));
check('fits：points 超限淘汰 a（c 因没给 slot 一并出局）', names(POOL, { points: 12 }) === 'b,d', names(POOL, { points: 12 }));
check('角色锁：slot 缺省时 c 不可抽', !names(POOL, {}).includes('c'), names(POOL, {}));
check('角色锁：slot=ending 时只剩 c', names(POOL, { slot: 'ending' }) === 'c', names(POOL, { slot: 'ending' }));
check('全筛空 → 返回空数组（不抛，抛的是 pickShot 的事）', eligibleShots(POOL, { slot: 'ending', energy: '低' }).length === 0);
check('空池/undefined list 不炸（返回空）', eligibleShots(null, {}).length === 0);

console.log('\n§3 pickShot（确定性 / 权重 / 报错）');
const one = pickShot(POOL, { tags: ['data'], seed: 42 });
check('同 list + 同 q 永远同一个结果', one.name === pickShot(POOL, { tags: ['data'], seed: 42 }).name
  && one.seed === 42, `两次抽到 ${one.name} vs ${pickShot(POOL, { tags: ['data'], seed: 42 }).name}`);
check('缺省 seed = 1（不写 seed 也有确定结果）', pickShot(POOL, { tags: ['data'] }).name === pickShot(POOL, { tags: ['data'], seed: 1 }).name);
check('返回值带 tags/w/fitsNote/pool（JSON 友好）', Array.isArray(one.tags) && typeof one.w === 'number'
  && Array.isArray(one.pool) && one.pool.length === 2, JSON.stringify(one).slice(0, 120));
const tally = { a: 0, b: 0 };
for (let i = 0; i < 60; i++) tally[pickShot(POOL, { tags: ['data'], seed: i + 1 }).name]++;
check('60 个 seed 里两个候选都出现过（不是"永远同一个"）', tally.a > 0 && tally.b > 0, JSON.stringify(tally));
const heavy = { a: 0, b: 0 };
for (let i = 0; i < 200; i++) heavy[pickShot(POOL, { tags: ['data'], seed: i + 1 }).name]++;
check('权重 1.4 vs 0.7 → 重的一方显著多抽（200 次 a>b）', heavy.a > heavy.b, JSON.stringify(heavy));
check('拼错 slot 点名词表', (threwMsg(() => pickShot(POOL, { slot: 'mid' })))?.includes('opening') === true,
  threwMsg(() => pickShot(POOL, { slot: 'mid' })) ?? '竟然没抛');
check('拼错 tag 点名词表', (threwMsg(() => pickShot(POOL, { tags: ['流量'] })))?.includes('SHOT_TAGS') !== true
  && (threwMsg(() => pickShot(POOL, { tags: ['流量'] })))?.includes('流量') === true,
  threwMsg(() => pickShot(POOL, { tags: ['流量'] })) ?? '竟然没抛');
check('chars 传非数点名', (threwMsg(() => pickShot(POOL, { chars: 'abc' })))?.includes('chars') === true,
  threwMsg(() => pickShot(POOL, { chars: 'abc' })) ?? '竟然没抛');
const emptyMsg = threwMsg(() => pickShot(POOL, { slot: 'ending', energy: '低' }));
check('落空给诊断：说清是哪一步筛空的', emptyMsg?.includes('energy') === true && emptyMsg?.includes('筛空') === true,
  emptyMsg ?? '竟然没抛');

console.log('\n§4 pickSequence（版内不重复）');
const seq1 = pickSequence(POOL, { tags: ['data'], seed: 9 }, 2);
const seq2 = pickSequence(POOL, { tags: ['data'], seed: 9 }, 2);
check('同 seed 同串', JSON.stringify(seq1.map((r) => r.name)) === JSON.stringify(seq2.map((r) => r.name)),
  JSON.stringify(seq1.map((r) => r.name)));
check('版内不重复', new Set(seq1.map((r) => r.name)).size === seq1.length, JSON.stringify(seq1.map((r) => r.name)));
const seqErr = threwMsg(() => pickSequence(POOL, { tags: ['data'] }, 5));
check('候选不够 n 个点名（第几个断的）', seqErr?.includes('抽到第 3') === true, seqErr ?? '竟然没抛');
check('n=1 等价 pickShot', pickSequence(POOL, { tags: ['data'], seed: 42 }, 1)[0].name === one.name);
check('n 非法点名', (threwMsg(() => pickSequence(POOL, {}, 0)))?.includes('n=') === true,
  threwMsg(() => pickSequence(POOL, {}, 0)) ?? '竟然没抛');

console.log('\n§5 真镜头库端到端（listShots() 全员）');
const list = listShots();
const draw = (q, n) => Array.from({ length: n }, (_, i) => pickShot(list, { ...q, seed: i + 1 }).name);
check('200 个 seed、无 slot：outro/whip/lockup 一次都不出现（角色锁不靠运气）',
  !draw({}, 200).some((n) => ['outro', 'whip', 'lockup'].includes(n)),
  draw({}, 200).filter((n) => ['outro', 'whip', 'lockup'].includes(n)).join(','));
check('slot=ending 只出 outro/lockup', [...new Set(draw({ slot: 'ending' }, 40))].every((n) => ['outro', 'lockup'].includes(n)),
  [...new Set(draw({ slot: 'ending' }, 40))].join(','));
check('slot=transition 只出 whip', [...new Set(draw({ slot: 'transition' }, 20))].join(',') === 'whip',
  [...new Set(draw({ slot: 'transition' }, 20))].join(','));
check('hasMusic:false 200 次：wave/pulse/grid 一次都不出现',
  !draw({ slot: 'content', hasMusic: false }, 200).some((n) => ['wave', 'pulse', 'grid'].includes(n)));
check('slot=opening + tags=title：出的是片头家族',
  [...new Set(draw({ slot: 'opening', tags: ['title'] }, 30))].every((n) => ['title', 'kinetic', 'bigtype'].includes(n)),
  [...new Set(draw({ slot: 'opening', tags: ['title'] }, 30))].join(','));
const longSeq = pickSequence(list, { slot: 'content' }, 8);
check('真库抽 8 连：无重复且确定性', new Set(longSeq.map((r) => r.name)).size === 8
  && JSON.stringify(longSeq.map((r) => r.name)) === JSON.stringify(pickSequence(list, { slot: 'content' }, 8).map((r) => r.name)),
  longSeq.map((r) => r.name).join(' → '));


// §6 角色槽归属（2026-10-31 修复）：slot 卡住时必须点名 slot，不能报成 fits
const errOf = (q) => { try { pickShot(list, q); return null; } catch (e) { return e.message; } };
const errEnding = errOf({ slot: 'ending', tags: ['data'] }) ?? '';
check('落空诊断点名 slot（不是 fits）',
  /slot=("ending"|ending)/.test(errEnding) && !/fits 筛空了/.test(errEnding), errEnding.slice(0, 80));
check('ending 位落空带角色锁提示', /只有 outro \/ lockup 进 ending/.test(errEnding), errEnding.slice(0, 110));
const opened = draw({ slot: 'opening' }, 60);
check('slot=opening 放行正文位模板', opened.length > 0 && !['outro', 'lockup', 'whip'].includes(opened[0]),
  opened.slice(0, 6).join(','));
if (fail) {
  console.log(`\n✗ 有 ${fail} 项失败`);
  for (const n of failed) console.log(`  · ${n}`);
  process.exitCode = 1;
} else {
  console.log(`\n✓ 全部通过（${pass} 项）`);
}
