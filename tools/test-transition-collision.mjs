// @ts-check
/**
 * **碰撞式转场**（'src/core/trans.js'）—— 离线单测。不需要 GPU / 浏览器 / Vite。
 *
 *   node tools/test-transition-collision.mjs
 *
 * 钉的是 BACKLOG 1-33 ③ / docs/MOTION.md §2、§3.5、§4 的那一条：
 * **受害者（被顶掉的旧内容）退出时长 = 入侵者（新内容）入场时长 × 0.40–0.50**。
 * 判据出处：docs/REFERENCE-hyperframes.md **518 行**（reactive-displacement）——
 * ⚠ **【外部经验值】，我方未实测**：这份单测证的不是"40–50% 最好看"，
 * 而是下面四件事（都是我们自己能负责的）：
 *
 *   ① 抄来的区间有没有原样落进代码（0.40 / 0.50 是常量，不是散落的字面量）；
 *   ② 越界**夹取**而不是静默通过，而且夹取时**有话要说**（warning 非空、带原值与区间）；
 *   ③ NaN / ±Inf 当场抛（"空 ≠ 干净"：不能当成"没越界"）；
 *   ④ **不传 victimRatio ⇒ 逐像素不变**（shader 源码与四个 uniform 与从前逐字相同）——
 *      已交付片子的画面一个像素都不许动，这条是硬要求。
 *
 * 最后一段是**接线自检**：kit/world.js 仍然是转发、regress-all 里挂上了、文档点了出处。
 * （"判据对了、接线没接上"这个坑 tools/test-layout.mjs 已经踩过一次，报告里全是 undefined。）
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  planCollision, victimSpan, transitionPass,
  VICTIM_RATIO_RANGE, VICTIM_RATIO_DEFAULT,
} from '../src/core/trans.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const SRC = read('src/core/trans.js');
const WORLD = read('src/kit/world.js');
const REGRESS = read('tools/regress-all.mjs');
const DOC = existsSync(path.join(ROOT, 'docs/MOTION.md')) ? read('docs/MOTION.md') : '';

/**
 * Pass 的构造函数不碰 gl（program 到第一次 render 才编译），所以一个空对象就够 —— 
 * 这也是这套判据能"不需要 GPU"的前提。真要渲染请走 anim still / video。
 */
const NO_GL = /** @type {any} */ ({});

let passed = 0;
const failed = [];
/** @param {string} name @param {() => void} fn */
function t(name, fn) {
  try { fn(); passed++; }
  catch (err) { failed.push('  x ' + name + '\n      ' + String(err && err.message ? err.message : err).split('\n').join('\n      ')); }
}

const near = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;

/* ═══════════════ 1. 区间常量本身：0.40 / 0.50 只在 one place ═══════════════ */

t('VICTIM_RATIO_RANGE 就是 [0.40, 0.50]：长度 2、下界 < 上界、两个都是有限数', () => {
  assert.ok(Array.isArray(VICTIM_RATIO_RANGE), '必须是数组（要能解构成 [lo, hi]）');
  assert.equal(VICTIM_RATIO_RANGE.length, 2);
  const [lo, hi] = VICTIM_RATIO_RANGE;
  assert.ok(Number.isFinite(lo) && Number.isFinite(hi));
  assert.ok(lo < hi, '下界必须小于上界：' + lo + ' / ' + hi);
  assert.ok(near(lo, 0.40), '下界应为 0.40（§4.4 518 行的 40%），实际 ' + lo);
  assert.ok(near(hi, 0.50), '上界应为 0.50（§4.4 518 行的 50%），实际 ' + hi);
});

t('VICTIM_RATIO_DEFAULT 落在区间内，且正好是区间中点 0.45', () => {
  const [lo, hi] = VICTIM_RATIO_RANGE;
  assert.ok(VICTIM_RATIO_DEFAULT >= lo && VICTIM_RATIO_DEFAULT <= hi,
    '默认值必须在区间内（否则"什么都不传"就先违规了）：' + VICTIM_RATIO_DEFAULT);
  assert.ok(near(VICTIM_RATIO_DEFAULT, (lo + hi) / 2));
  assert.ok(near(VICTIM_RATIO_DEFAULT, 0.45));
});

/* ═══════════════ 2. 区间内：原样返回 ═══════════════ */

t('区间内的比例原样返回（下界 / 中点 / 上界三个点都不夹、不告警）', () => {
  for (const r of [0.40, 0.45, 0.50, 0.412, 0.499]) {
    const c = planCollision({ enterDur: 0.6, ratio: r });
    assert.equal(c.ratio, r, '比值被改动了：' + r + ' → ' + c.ratio);
    assert.equal(c.clamped, false, '区间内不该被判成夹取：' + r);
    assert.equal(c.degenerate, false);
    assert.equal(c.ok, true);
    assert.equal(c.warning, null, '区间内不该有说明：' + r);
  }
});

t('端点是闭区间：正好 0.40 / 0.50 不算越界', () => {
  const lo = planCollision({ enterDur: 2, ratio: VICTIM_RATIO_RANGE[0] });
  const hi = planCollision({ enterDur: 2, ratio: VICTIM_RATIO_RANGE[1] });
  assert.equal(lo.clamped, false);
  assert.equal(hi.clamped, false);
  assert.ok(near(lo.victimDur, 0.8), '2s × 0.40 = 0.8s，实际 ' + lo.victimDur);
  assert.ok(near(hi.victimDur, 1.0), '2s × 0.50 = 1.0s，实际 ' + hi.victimDur);
});

t('victimDur = enterDur × ratio，且 min/maxVictimDur 就是 40% / 50% 两条边', () => {
  const c = planCollision({ enterDur: 1.5, ratio: 0.45 });
  assert.ok(near(c.victimDur, 0.675));
  assert.ok(near(c.minVictimDur, 0.6));
  assert.ok(near(c.maxVictimDur, 0.75));
  assert.equal(c.enterDur, 1.5);
  assert.equal(c.rawEnterDur, 1.5);
});

/* ═══════════════ 3. 越界：夹取 + 说明（不静默） ═══════════════ */

t('低于 0.40 ⇒ 夹到 0.40（0.2 / 0 / 负数都一样）', () => {
  for (const r of [0.2, 0.39, 0.0, -1, -0.5]) {
    const c = planCollision({ enterDur: 1, ratio: r });
    assert.equal(c.ratio, VICTIM_RATIO_RANGE[0], r + ' 应夹到 0.40，实际 ' + c.ratio);
    assert.equal(c.clamped, true);
    assert.equal(c.rawRatio, r, '原值必须留着（要能看出你给的是什么）');
    assert.equal(c.ok, false, '夹取过就不是 ok —— 它和"原本就合规"不是一回事');
    assert.ok(near(c.victimDur, 0.40));
  }
});

t('高于 0.50 ⇒ 夹到 0.50（0.8 / 5 / 1 都一样）', () => {
  for (const r of [0.8, 0.51, 1, 5]) {
    const c = planCollision({ enterDur: 1, ratio: r });
    assert.equal(c.ratio, VICTIM_RATIO_RANGE[1], r + ' 应夹到 0.50，实际 ' + c.ratio);
    assert.equal(c.clamped, true);
    assert.ok(near(c.victimDur, 0.50));
  }
});

t('夹取时返回的说明非空，且说清三件事：原值 / 区间 / 夹取后的受害者时长', () => {
  const c = planCollision({ enterDur: 0.6, ratio: 0.2 });
  assert.equal(typeof c.warning, 'string', '夹取了就必须有话要说（本函数只判定，喊不喊由调用方决定）');
  assert.ok(c.warning.length > 0);
  assert.ok(c.warning.includes('0.2'), '要带上你原本给的那个数：' + c.warning);
  assert.ok(c.warning.includes('0.4') && c.warning.includes('0.5'), '要带上区间：' + c.warning);
  assert.ok(c.warning.includes('0.24'), '要带上夹取后的时长（0.6 × 0.40 = 0.24）：' + c.warning);
  assert.ok(/40[–-]50%/.test(c.warning), '要能对回出处那条判据（40–50%）：' + c.warning);
});

/* ═══════════════ 4. 非有限数：不许静默通过 ═══════════════ */

t('ratio = NaN 当场抛（不许当成"没越界"）', () => {
  assert.throws(() => planCollision({ enterDur: 1, ratio: NaN }), /有限数/);
});

t('ratio = ±Infinity 当场抛', () => {
  assert.throws(() => planCollision({ enterDur: 1, ratio: Infinity }), /有限数/);
  assert.throws(() => planCollision({ enterDur: 1, ratio: -Infinity }), /有限数/);
});

t('enterDur = NaN / Infinity 当场抛；不是数字也抛', () => {
  assert.throws(() => planCollision({ enterDur: NaN }), /有限数/);
  assert.throws(() => planCollision({ enterDur: Infinity }), /有限数/);
  assert.throws(() => planCollision({ enterDur: '0.6' }), /有限数/);
  assert.throws(() => victimSpan(NaN), /有限数/);
});

t('缺项走默认值（不是抛）：planCollision() ⇒ enterDur 1、ratio 0.45', () => {
  const c = planCollision();
  assert.equal(c.enterDur, 1);
  assert.equal(c.ratio, VICTIM_RATIO_DEFAULT);
  assert.equal(c.clamped, false);
  assert.equal(c.warning, null);
});

/* ═══════════════ 5. 没有交叠期：行为有明确定义（并断言） ═══════════════ */

t('enterDur = 0 ⇒ 受害者时长记 0、degenerate、有说明、比例保留、不出 NaN', () => {
  const c = planCollision({ enterDur: 0, ratio: 0.45 });
  assert.equal(c.victimDur, 0, '没有交叠期就没有退出时长 —— 记 0，不是 NaN');
  assert.ok(Number.isFinite(c.victimDur));
  assert.equal(c.degenerate, true);
  assert.equal(c.ok, false, 'degenerate 不算 ok（"没判"与"通过"不是一回事）');
  assert.equal(c.ratio, 0.45, '比例照原样留着，等有了交叠期再生效');
  assert.ok(typeof c.warning === 'string' && c.warning.includes('0'), '必须有说明：' + c.warning);
  assert.equal(c.minVictimDur, 0);
  assert.equal(c.maxVictimDur, 0);
});

t('enterDur < 0 ⇒ 与 0 一致（受害者时长 0，不是负数）', () => {
  for (const d of [-0.5, -3]) {
    const c = planCollision({ enterDur: d, ratio: 0.5 });
    assert.equal(c.victimDur, 0, '负数时长会让旧内容"倒退"，一律记 0');
    assert.ok(c.victimDur >= 0);
    assert.equal(c.degenerate, true);
    assert.equal(c.rawEnterDur, d);
  }
});

t('degenerate 与越界同时发生 ⇒ 两条说明都在（不是只报一条就完事）', () => {
  const c = planCollision({ enterDur: -1, ratio: 0.9 });
  assert.equal(c.degenerate, true);
  assert.equal(c.clamped, true);
  assert.equal(c.victimDur, 0);
  assert.ok(c.warning.split('。').filter(Boolean).length >= 2, '两条都该说：' + c.warning);
});

/* ═══════════════ 6. 换一批数字扫一遍：恒在区间内、不退化 ═══════════════ */

t('扫 120 组 enterDur × ratio：victimDur 恒落在 [40%, 50%] 之内，且全程有限', () => {
  for (let i = 0; i <= 12; i++) {
    const dur = 0.05 * i;                       // 0 … 0.6s
    for (let j = -4; j <= 16; j++) {
      const r = j / 10;                        // -0.4 … 1.6（两头都越界）
      const c = planCollision({ enterDur: dur, ratio: r });
      assert.ok(Number.isFinite(c.victimDur), '出现非有限值：dur=' + dur + ' r=' + r);
      if (dur > 0) {
        assert.ok(c.victimDur >= c.minVictimDur - 1e-12, 'dur=' + dur + ' r=' + r);
        assert.ok(c.victimDur <= c.maxVictimDur + 1e-12, 'dur=' + dur + ' r=' + r);
        assert.ok(near(c.victimDur, dur * c.ratio), 'dur=' + dur + ' r=' + r);
      } else {
        assert.equal(c.victimDur, 0);
      }
    }
  }
});

t('victimSpan 与 planCollision().victimDur 逐位相同（同一个实现，不另算一套）', () => {
  for (const [d, r] of [[0.6, 0.45], [1.2, 0.4], [0.3, 0.5], [2, 0.8], [0, 0.45], [-1, 0.2]]) {
    assert.equal(victimSpan(d, r), planCollision({ enterDur: d, ratio: r }).victimDur, d + ' / ' + r);
  }
  assert.equal(victimSpan(), VICTIM_RATIO_DEFAULT, '缺省 enterDur = 1 ⇒ 时长就是默认比例本身');
  assert.equal(victimSpan(3), 3 * VICTIM_RATIO_DEFAULT);
});

t('纯函数：同参数两次调用逐字段相同（没有隐藏状态、不读时钟）', () => {
  for (const [d, r] of [[0.6, 0.2], [0.6, 0.45], [0, 0.9], [1, 0.5]]) {
    assert.deepEqual(planCollision({ enterDur: d, ratio: r }), planCollision({ enterDur: d, ratio: r }));
  }
});

/* ═══════════════ 7. transitionPass 接线：不传 = 逐像素不变 ═══════════════ */

t('不传任何 opts ⇒ 四个 uniform 与 key 逐字等于从前的常量（fadeAt 0.55 / push 0.36 / blur 0.085）', () => {
  const p = transitionPass(NO_GL);
  assert.equal(p.u.fadeAt.value, 0.55, '默认的 fadeAt 改了 —— 已交付片子的画面就变了');
  assert.equal(p.u.push.value, 0.36);
  assert.equal(p.u.blur.value, 0.085);
  assert.equal(p.key, 'trans_push');
  assert.equal(p.blend, true);
  assert.equal(p.collision, null, '没传 victimRatio 就没有比例计划（老路径）');
});

t('不传 victimRatio 与"显式 fadeAt 0.55"产出**逐字符相同**的 shader（最强的"画面没变"证据）', () => {
  assert.equal(transitionPass(NO_GL).src, transitionPass(NO_GL, { fadeAt: 0.55 }).src);
  assert.ok(transitionPass(NO_GL).src.includes('max(0.02, fadeAt)'),
    'alpha 必须仍然由 fadeAt 这个 uniform 算出来 —— 否则 victimRatio 就不是"同一个旋钮"了');
});

t('传 victimRatio ⇒ fadeAt = 夹取后的比例，collision 带计划（区间内时无需告警）', () => {
  const p = transitionPass(NO_GL, { victimRatio: 0.42 });
  assert.equal(p.u.fadeAt.value, 0.42);
  assert.ok(p.collision, 'pass.collision 要能读到这次的比例计划');
  assert.equal(p.collision.ratio, 0.42);
  assert.equal(p.collision.clamped, false);
  assert.equal(p.collision.warning, null);
  assert.ok(near(p.collision.victimDur, 0.42), 'enterDur=1（归一化口径）⇒ 时长 = 比例');
});

t('越界的 victimRatio ⇒ fadeAt 夹到 0.40 / 0.50，且 pass.collision.warning 非空', () => {
  const low = transitionPass(NO_GL, { victimRatio: 0.1 });
  assert.equal(low.u.fadeAt.value, VICTIM_RATIO_RANGE[0]);
  assert.equal(low.collision.clamped, true);
  assert.ok(typeof low.collision.warning === 'string' && low.collision.warning.length > 0);

  const high = transitionPass(NO_GL, { victimRatio: 0.9 });
  assert.equal(high.u.fadeAt.value, VICTIM_RATIO_RANGE[1]);
  assert.equal(high.collision.clamped, true);
  assert.ok(high.collision.warning.includes('0.9'));
});

t('victimRatio = NaN ⇒ 建 Pass 的时候就抛（不留到渲染时才怪）', () => {
  assert.throws(() => transitionPass(NO_GL, { victimRatio: NaN }), /有限数/);
});

t('fadeAt 与 victimRatio 同时给 ⇒ 抛（同一个旋钮的两种写法，静默忽略一个比抛错贵得多）', () => {
  assert.throws(() => transitionPass(NO_GL, { fadeAt: 0.4, victimRatio: 0.4 }), /只给一个/);
});

t('只给 fadeAt ⇒ 老路径照旧（fadeAt 生效、collision 仍是 null）', () => {
  const p = transitionPass(NO_GL, { fadeAt: 0.3 });
  assert.equal(p.u.fadeAt.value, 0.3);
  assert.equal(p.collision, null);
});

/* ═══════════════ 8. 接线自检 + 静态扫描 ═══════════════ */

t('src/kit/world.js 仍然是转发：两个 transitionPass 都原样传 opts（含 victimRatio）', () => {
  assert.ok(/export function transitionPass\(gl, opts = \{\}\) \{\s*return coreTransitionPass\(gl, opts\);/.test(WORLD),
    'kit/world.js 的 transitionPass 必须仍是一行转发（同一件事不该有第二份实现）');
  assert.ok(/transitionPass\(ctx\.gl, opts\)/.test(WORLD), 'makeWorldKit 必须把 opts 原样交给 transitionPass');
  assert.ok(WORLD.includes('victimRatio'), '转发层的注释里要点出 victimRatio（否则没人知道这个入口存在）');
});

t('trans.js 里没有 Math.random / Date.now / performance.now（纯函数、确定性）', () => {
  assert.ok(!/Math\s*\.\s*random/.test(SRC), '不许有 Math.random');
  assert.ok(!/Date\s*\.\s*now/.test(SRC), '不许有 Date.now');
  assert.ok(!/performance\s*\.\s*now/.test(SRC), '不许有 performance.now');
});

t('trans.js 的文件头把出处点到行，并如实标注「外部经验值 / 我方未实测」', () => {
  assert.ok(/REFERENCE-hyperframes\.md/.test(SRC), '头部必须写出处文件名');
  assert.ok(SRC.includes('518 行'), '必须点到 518 行（reactive-displacement 那条）');
  assert.ok(/外部经验值/.test(SRC) && /未实测/.test(SRC),
    '必须标明它是外部经验值、我方未实测 —— 把别人的经验值当成我方实测比写错数字更严重');
  assert.ok(/VICTIM_RATIO_RANGE/.test(SRC), '常量必须真的存在（别把 0.4 / 0.5 散在代码里）');
});

t('tools/regress-all.mjs 的 unit: 组里挂上了本文件', () => {
  assert.ok(/name: 'unit:transition-collision'/.test(REGRESS), '回归清单里没有 unit:transition-collision');
  assert.ok(/cmd: \['tools\/test-transition-collision\.mjs'\]/.test(REGRESS),
    'unit:transition-collision 指的必须是 tools/test-transition-collision.mjs');
});

t('docs/MOTION.md 里这一条已经从"没有函数"改成"已落地"，并点了函数名与区间', () => {
  assert.ok(DOC.length > 0, 'docs/MOTION.md 不存在或为空');
  assert.ok(/40[–-]50%/.test(DOC), '判据本体还在（40–50%）');
  assert.ok(/planCollision/.test(DOC), '规则表/§4 里要点出 planCollision');
  assert.ok(/VICTIM_RATIO_RANGE/.test(DOC), '要点出常量区间（别让人再抄一遍 0.4 / 0.5）');
  assert.ok(!/只有判据，\*\*没有函数\*\*/.test(DOC), '§4 那张表里还写着"没有函数" —— 表没改');
});

/* ────────────────────────────────────────── 汇总 */

console.log('test-transition-collision: ' + passed + ' 项通过'
  + (failed.length ? '，' + failed.length + ' 项失败' : ''));
for (const f of failed) console.log(f);
process.exit(failed.length ? 1 : 0);
