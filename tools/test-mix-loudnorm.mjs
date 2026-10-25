// @ts-check
/**
 * `anim mix --target` 的离线回归：**归一化这一步算得对不对**。
 *
 *   node tools/test-mix-loudnorm.mjs
 *
 * 三件事，各自对应一个真实的坑：
 *
 *   ① **纯函数分支**：`resolveLoudnessTarget()` / `planLoudnorm()` 的每一条出口
 *      （达标 / 目标更轻 / 量不出 / 两遍 linear / 退回单遍 / 增益会被真峰拦住）。
 *      这些分支错了**不会报错**，只会让"归一化过了"变成一句假话 —— 只能靠断言钉住。
 *   ② **真跑一遍**：合成一段**已知响度**的 997Hz 测试音（EBU R128 的技术频率）→ 归一化到靶子上 →
 *      再量一次，读数必须落在 ±1 LU 内。"报了个数字"和"数字是对的"是两件事。
 *   ③ **默认一个字节都不变**：同一段输入混两次，mp3 必须逐字节相同，而且**没有**走归一化分支。
 *      这是这次改动最硬的一条：已交付片子的音轨不能因为加了 `--target` 就重新编码。
 *
 * 只用 ffmpeg + 纯 JS：**不启浏览器、不启 Vite、不渲染任何一帧**。
 * 夹具与产物一律写 `os.tmpdir()`，**不往仓库里写任何文件**。
 * 没有 ffmpeg 时明确报"跳过"并 `exit 2` —— 不要假装通过（照 `tools/test-loudness.mjs`）。
 *
 * 退出码：0 = 全通过 · 1 = 有断言失败 · 2 = 环境不满足（没有 ffmpeg / 没有 loudnorm），**不算通过**。
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LOUDNESS_PRESETS, applyLoudnorm, planLoudnorm, resolveLoudnessTarget, runMix,
} from '../scripts/lib/mix.mjs';
import { LOUDNESS_TARGET, measureLoudness, probeDuration, writeWav16 } from '../scripts/lib/media.mjs';

const DIR = path.join(os.tmpdir(), 'anim-mix-loudnorm');
const FIX = path.join(DIR, 'fixtures');
const FFMPEG = process.env.ANIM_FFMPEG || 'ffmpeg';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`);
  if (ok) pass++; else fail++;
};

/* ── 0. 环境：没有 ffmpeg（或没有 loudnorm）就明确退出 2，绝不假装通过 ── */
const probe = spawnSync(FFMPEG, ['-hide_banner', '-version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) {
  console.log(`⏭  跳过：没有可用的 ffmpeg（${FFMPEG}）—— ${probe.error?.message ?? `exit ${probe.status}`}`);
  console.log('   装一个，或用 ANIM_FFMPEG 指定路径。**这一条不算通过。**');
  process.exit(2);
}
console.log(`ffmpeg：${FFMPEG}`);
console.log(`        ${String(probe.stdout).split('\n')[0].trim()}`);
if (!/loudnorm/i.test(String(spawnSync(FFMPEG, ['-hide_banner', '-filters'], { encoding: 'utf8' }).stdout))) {
  console.log('⏭  跳过：这个 ffmpeg 没有 loudnorm 滤镜（EBU R128）。**这一条不算通过。**');
  process.exit(2);
}

rmSync(DIR, { recursive: true, force: true });
mkdirSync(FIX, { recursive: true });

/** 跑一条 ffmpeg，失败就抛（本文件只在生成夹具时用它）。 */
const ff = (args) => {
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`ffmpeg 失败：${args.join(' ')}\n${String(r.stderr).split('\n').slice(-4).join('\n')}`);
  }
  return r;
};
/** 文件的 sha256 前 16 位 —— "逐字节相同"这条判据只用它，别用文件大小（大小相同内容可能不同）。 */
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);

/**
 * 合成一段**已知响度**的测试音（双声道同相 997Hz），再编成 mp3 —— 与真实链路同一种编码。
 *
 * ⚠ 表达式必须是 `aevalsrc` 而不是 `sine`：本机 ffmpeg 8 的 `sine` **没有 amplitude 选项**，
 *   电平写死（实测 RMS −21.1 dBFS），拿它当"已知响度"的基准会整整差 21 dB
 *   （`tools/test-loudness.mjs` 的 `toneAt` 里记着这个坑）。
 * ⚠ 立体声要把两路写进**同一个** aevalsrc 表达式（`L|R`），不能靠 `-ac 2` 下混：
 *   ffmpeg 的下混会乘 0.5，每声道又低 6 dB，读数就不再是"我们以为给了多少"。
 */
const toneMp3 = (db, name, { duration = 6, freq = 997 } = {}) => {
  const amp = 10 ** (db / 20);
  const ch = `${amp}*sin(2*PI*${freq}*t)`;
  const wav = path.join(FIX, `${name}.wav`);
  const mp3 = path.join(FIX, `${name}.mp3`);
  ff(['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc=${ch}|${ch}:s=48000:d=${duration}`, '-c:a', 'pcm_s16le', wav]);
  ff(['-y', '-v', 'error', '-i', wav, '-b:a', '192k', mp3]);
  return { wav, mp3, amp };
};

/* ── 1. 靶子：三种写法都要收口，写错必须抛（不许静默回落到默认靶子） ── */
console.log('\n① resolveLoudnessTarget：预设 / 数字 / 对象 / off，写错就抛');
check('streaming 与 media.mjs 的 LOUDNESS_TARGET 是同一组数（不抄数字）',
  JSON.stringify(LOUDNESS_PRESETS.streaming) === JSON.stringify(LOUDNESS_TARGET),
  JSON.stringify(LOUDNESS_PRESETS.streaming));
check('cinema 是另一组靶子（−23 LUFS / −2 dBTP，与 streaming 不同）',
  LOUDNESS_PRESETS.cinema.i === -23 && LOUDNESS_PRESETS.cinema.tp === -2
  && LOUDNESS_PRESETS.cinema.i !== LOUDNESS_TARGET.i,
  JSON.stringify(LOUDNESS_PRESETS.cinema));
check('off / undefined / null 都是"不归一化"（null）',
  resolveLoudnessTarget('off') === null && resolveLoudnessTarget(undefined) === null && resolveLoudnessTarget(null) === null);
const num = resolveLoudnessTarget(-16);
check('数字 = 只改整合响度，真峰与 LRA 仍取 streaming 那一组',
  num && num.i === -16 && num.tp === LOUDNESS_TARGET.tp && num.lra === LOUDNESS_TARGET.lra, JSON.stringify(num));
// 命令行上 \`--target -14\` 拿到的是**字符串** —— 不认它，作者就只能写 --target=-14（我们的 argv 解析不认那种写法）
const numStr = resolveLoudnessTarget('-14');
check('命令行传进来的 "-14"（字符串数字）与数字 -14 等价',
  numStr && numStr.i === -14 && numStr.tp === LOUDNESS_TARGET.tp, JSON.stringify(numStr));
const withLra = resolveLoudnessTarget('cinema', '8');
check('--lra 只覆盖 LRA，不动靶子的另外两个数',
  withLra && withLra.i === -23 && withLra.lra === 8, JSON.stringify(withLra));
const obj = resolveLoudnessTarget({ i: -20 });
check('对象写法：只给 i 时 tp/lra 用默认值补齐',
  obj && obj.i === -20 && obj.tp === LOUDNESS_TARGET.tp && obj.lra === LOUDNESS_TARGET.lra, JSON.stringify(obj));
let threw = null;
try { resolveLoudnessTarget('streamin'); } catch (e) { threw = e; }
check('预设名写错（streamin）→ 抛错，不静默回落到默认靶子', !!threw && /不认识/.test(threw.message),
  threw ? threw.message.split('\n')[0] : '(没有抛)');
let threw2 = null;
try { resolveLoudnessTarget({ i: -3 }); } catch (e) { threw2 = e; }
check('靶子超出 loudnorm 的合法范围（i = −3）→ 抛错，不交给 ffmpeg 去非零退出', !!threw2 && /范围/.test(threw2.message),
  threw2 ? threw2.message.split('\n')[0] : '(没有抛)');
let threw3 = null;
try { resolveLoudnessTarget(undefined, 8); } catch (e) { threw3 = e; }
check('只给 --lra 不给 --target → 抛错（"压到 LRA 8" 没有靶子是句空话）',
  !!threw3 && /LRA/.test(threw3.message), threw3 ? threw3.message.split('\n')[0] : '(没有抛)');

/* ── 2. planLoudnorm：每一条出口都要有话说（静默是最坏的失败） ── */
console.log('\n② planLoudnorm：达标 / 更轻 / 量不出 / 两遍 linear / 退回单遍 / 会被真峰拦住');
const AF_REQUIRED = ['I=-14.00', 'TP=-1.00', 'LRA=11.00', 'measured_I=', 'measured_TP=', 'measured_LRA=',
  'measured_thresh=', 'offset=', 'linear=true', 'print_format=json'];

const pHot = planLoudnorm({ i: -13.99, tp: -0.89, lra: 4.5, thresh: -24.26, targetOffset: 0.03 }, 'streaming');
check('已经比靶子响、真峰顶着 → 计划里**明说**会压动态（mode = dynamic）', pHot.mode === 'dynamic', pHot.reason);
check('  af 串带齐 measured_* 与 linear=true / print_format=json',
  AF_REQUIRED.every((s) => String(pHot.af).includes(s)), String(pHot.af).slice(0, 120) + '…');
check('  理由里点明了真峰会超（不是一句"要压缩"了事）',
  /真峰/.test(pHot.reason) && /超过上限/.test(pHot.reason), pHot.reason);
check('  但它仍然把 linear=true 写出去（"请求"照发，实际由 ffmpeg 判）',
  String(pHot.af).includes('linear=true') && String(pHot.af).includes('measured_I=-13.99'));

const pQuiet = planLoudnorm({ i: -21.2, tp: -10.0, lra: 6, thresh: -31.2, targetOffset: 0.2 }, 'streaming');
check('偏轻 + 真峰有余量 → 两遍 linear（纯常数增益，动态不变）', pQuiet.mode === 'linear', pQuiet.reason);
check('  增益 = 目标 − 现状（−14 − (−21.2) = 7.2 dB）', Math.abs(pQuiet.gainDb - 7.2) < 1e-6, pHot ? `${pQuiet.gainDb}` : '');
check('  线性预测的真峰也在余量内（−10 + 7.2 = −2.8 ≤ −1）', /余量够/.test(pQuiet.reason), pQuiet.reason);
const pNoRoom = planLoudnorm({ i: -21.2, tp: -6.0, lra: 6, thresh: -31.2, targetOffset: 0.2 }, 'streaming');
check('同一个响度、但真峰只到 −6 dBTP（提 7.2 会顶到 +1.2）→ 计划改判 dynamic 并说明',
  pNoRoom.mode === 'dynamic' && /真峰/.test(pNoRoom.reason), pNoRoom.reason);

const pLighter = planLoudnorm({ i: -9.0, tp: -12.0, lra: 3, thresh: -19, targetOffset: 0 }, 'streaming');
check('目标比现状**更轻**（−9 → −14）→ 也要真的做（linear，增益为负）',
  pLighter.mode === 'linear' && pLighter.gainDb < 0, `${pLighter.mode} ${pLighter.gainDb.toFixed(2)} dB`);

const pOk = planLoudnorm({ i: -14.2, tp: -2.0, lra: 4, thresh: -24, targetOffset: 0 }, 'streaming');
check('已经达标（±1 LU 且真峰不超）→ skip，**不动音轨**', pOk.mode === 'skip' && pOk.af === null, pOk.reason);
check('  skip 的理由里带着读数与容差（人能看懂"为什么不动"）',
  /已经达标/.test(pOk.reason) && /容差/.test(pOk.reason), pOk.reason);

const pNan = planLoudnorm({ i: NaN, tp: -3, lra: 2, thresh: -30, targetOffset: 0 }, 'streaming');
check('量不出整合响度（NaN）→ skip 且**点名**是"量不出"', pNan.mode === 'skip' && /量不出/.test(pNan.reason), pNan.reason);
const pSilent = planLoudnorm({ i: -Infinity, tp: -Infinity, lra: 0, thresh: -Infinity, targetOffset: 0 }, 'streaming');
check('静音（−∞）→ 也是 skip（不是拿 −∞ 去算一个天文数字的增益）',
  pSilent.mode === 'skip' && /量不出/.test(pSilent.reason), pSilent.reason);

const pPartial = planLoudnorm({ i: -21.2, tp: -3, lra: 6, thresh: -70, targetOffset: 0 }, 'streaming');
check('门限是 −70（loudnorm 的"没量到"哨兵值）→ 退回**单遍**', pPartial.mode === 'single-pass', pPartial.reason);
check('  单遍的 af **不带** measured_*（带了就是拿假数据算增益）',
  !String(pPartial.af).includes('measured_') && /print_format=json/.test(String(pPartial.af)), String(pPartial.af));
check('  并且**明说**这一遍是"压动态换响度"', /压动态换响度/.test(pPartial.reason), pPartial.reason);
const pNoTp = planLoudnorm({ i: -21.2, tp: NaN, lra: 6, thresh: -31, targetOffset: 0 }, 'streaming');
check('真峰量不出（NaN）→ 同样退回单遍（单遍不需要 measured_TP）', pNoTp.mode === 'single-pass', pNoTp.reason);

const pCinema = planLoudnorm({ i: -14, tp: -3, lra: 6, thresh: -24, targetOffset: 0 }, 'cinema');
check('同一个读数换成 cinema 靶子 → 变成"要压 9 dB"（靶子换了判据就换）',
  pCinema.mode === 'linear' && Math.abs(pCinema.gainDb + 9) < 1e-6,
  `${pCinema.mode} ${pCinema.gainDb.toFixed(2)} dB`);
check('planLoudnorm 对"没给靶子"也有话说（不是静默返回 undefined）',
  planLoudnorm({ i: -20, tp: -3, lra: 3, thresh: -30 }, null).mode === 'skip');

/* ── 3. 真跑一遍：已知响度的测试音 → 归一化 → 再量一次 ──
 *
 * 期望值用**本机实测标定**：双声道同相正弦的整合响度 ≈ 峰值(dBFS) − 0.05
 * （推导与实测记录在 `tools/test-loudness.mjs` 的 `toneAt` 里）。
 * 这里不拿"理论上应该 −0.691"去断言 —— 我们报数字用的就是 ffmpeg 的 loudnorm。 */
console.log('\n③ 端到端：−20 dBFS 的测试音 → 归一化到 −14 LUFS → 再量');
const fixture = toneMp3(-20, 'tone-minus20');
const mBefore = measureLoudness(fixture.mp3);
const plan = planLoudnorm(mBefore, 'streaming');
console.log(`     处理前 ${mBefore.i.toFixed(2)} LUFS / ${mBefore.tp.toFixed(2)} dBTP（计划：${plan.mode}）`);
check('测试音量出来 ≈ −20 LUFS（与 test-loudness 的标定同口径）', Math.abs(mBefore.i - -20) < 1.0,
  `${mBefore.i.toFixed(2)} LUFS`);
check('计划是两遍 linear（−20 → −14 要提 6 dB，真峰远够）', plan.mode === 'linear', plan.reason);
const applied = applyLoudnorm(fixture.mp3, plan, { bitrate: '192k' });
const mAfter = measureLoudness(fixture.mp3);
console.log(`     处理后 ${mAfter.i.toFixed(2)} LUFS / ${mAfter.tp.toFixed(2)} dBTP（ffmpeg 报 ${applied.normalizationType ?? '(没报告)'}）`);
check('归一化后落在 −14 LUFS 的 ±1 LU 内', Math.abs(mAfter.i - -14) <= 1.0,
  `${mAfter.i.toFixed(2)} LUFS（差 ${(mAfter.i - -14).toFixed(2)} LU）`);
check('真峰没有超过 −1 dBTP', mAfter.tp <= -1 + 1e-6, `${mAfter.tp.toFixed(2)} dBTP`);
check('真的动了（前后差 ≥ 4 LU —— 不是"报了个数字"）', mAfter.i - mBefore.i >= 4,
  `${mBefore.i.toFixed(2)} → ${mAfter.i.toFixed(2)}（+${(mAfter.i - mBefore.i).toFixed(2)} LU）`);
check('第二遍的 loudnorm JSON 拿得到（linear / dynamic 能核对，不靠猜）',
  applied.output !== null && typeof applied.normalizationType === 'string',
  JSON.stringify({ output_i: applied.output?.output_i, type: applied.normalizationType }));
// ⚠ linear=true 只是**请求**：增益放不进真峰余量（或 measured_LRA = 0）时 ffmpeg 会自己改走 dynamic。
//   这里钉住的是"计划有没有**预告**这件事"，而不是"实际一定是 linear" —— 一段 997Hz 正弦的
//   LRA 本来就是 0，ffmpeg 必然报 dynamic（实测：同一段只改 measured_LRA，0 → dynamic、0.001 → linear）。
//   计划**没预告**却实际 dynamic 才是真问题（那才是"动态被悄悄削了"），归 ⑤ 的打印判据去抓。
check('这一段（恒定电平，measured_LRA = 0）计划里已经预告了会退回 dynamic',
  applied.normalizationType === 'dynamic' ? plan.linearExpected === false : plan.linearExpected === true,
  `实际 ${applied.normalizationType}，plan.linearExpected=${plan.linearExpected}`);
check('  而它仍然落在靶子上（退回 dynamic 不等于归一化失败）', Math.abs(mAfter.i - -14) <= 1.0,
  `${mAfter.i.toFixed(2)} LUFS`);
check('时长没被改动（归一化不该裁掉尾巴）',
  Math.abs(probeDuration(fixture.mp3) - 6) <= 0.1, `${probeDuration(fixture.mp3).toFixed(2)}s`);
let threwApply = null;
try { applyLoudnorm(fixture.mp3, { mode: 'skip', af: null }); } catch (e) { threwApply = e; }
check('applyLoudnorm 拒绝执行 skip 计划（防止"跳过了却以为归一化了"）', !!threwApply);

/* ── 4. 走 anim mix 的真正入口：**默认一个字节都不变** ──
 *
 * 这是这次改动的硬约束：不传 target 时，混音路径一个字节都不许变。三层判据：
 *   ① 同一份输入混两次，mp3 的 sha256 相同。mp3 编码器**可能**写编码器版本/时间戳之类的元数据，
 *      那样这条会红 —— 本机 ffmpeg 8.1.2 实测是确定的（libmp3lame 只写 TSSE = Lavf 版本号），
 *      所以这里直接钉字节；真遇到不确定的编码器，判据应退成"两次读数相同 + 没有走归一化分支"。
 *   ② 返回值里 target === null、after === null、normalized === false（**没有**偷偷跑第二遍）。
 *   ③ 打印里没有"归一化"那几行（默认路径的日志与改动前一致）。 */
console.log('\n④ anim mix 默认路径：混两次逐字节相同，且没有走归一化');
const TASK = '_mixloudnorm';
const TASK_DIR = path.join(DIR, TASK);
const SR = 44100;
rmSync(TASK_DIR, { recursive: true, force: true });
mkdirSync(path.join(TASK_DIR, 'audio', 'vo'), { recursive: true });
// task.config.mjs 只需要 audio 字段（resolveMusic 是**文本读**的，不走 import）
writeFileSync(path.join(TASK_DIR, 'task.config.mjs'),
  '// 夹具（tools/test-mix-loudnorm.mjs 生成；只验 Node 侧的混音链路，不渲染）\n'
  + 'export default {\n  title: \'mix loudnorm 夹具\', width: 320, height: 180, fps: 30,\n'
  + '  audio: { music: \'./audio/bed.wav\' },\n  timeline: [],\n};\n');
/** 每句旁白一个 wav（placeVo 用 decodeMono 逐句读；220Hz 正弦，与 test-say 的夹具同一种形状）。 */
const line = (name, amp, dur) => {
  const n = Math.ceil(dur * SR);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin((2 * Math.PI * 220 * i) / SR);
  writeWav16(path.join(TASK_DIR, 'audio', 'vo', name + '.wav'), [a, a], SR);
};
line('a', 0.06, 1.3);
line('b', 0.06, 1.2);
const BED_DUR = 6;
const bed = new Float32Array(BED_DUR * SR);
for (let b = 0; b * 0.5 < BED_DUR; b++) {
  const at = Math.round(b * 0.5 * SR);
  for (let i = 0; i < SR * 0.08 && at + i < bed.length; i++) {
    bed[at + i] = 0.28 * Math.sin((2 * Math.PI * 160 * i) / SR) * Math.exp(-i / (SR * 0.02));
  }
}
writeWav16(path.join(TASK_DIR, 'audio', 'bed.wav'), [bed, bed], SR);
writeFileSync(path.join(TASK_DIR, 'audio', 'timing.json'), JSON.stringify({
  total: BED_DUR, beat: 0.5, overlap: 'beat', tail: 1,
  scenes: [{
    id: 'x', start: 0, slot: BED_DUR, stretch: 1, internal: 4,
    lines: [
      { index: 0, id: 'x-1', text: '第一句。', file: 'audio/vo/a.wav', offset: 0.5, dur: 1.3, cue: 0.5 },
      { index: 1, id: 'x-2', text: '第二句。', file: 'audio/vo/b.wav', offset: 3.0, dur: 1.2, cue: 2.5 },
    ],
  }],
}, null, 2));

const logsA = [];
const outA = path.join(DIR, 'mix-default-a.mp3');
const resA = runMix(TASK, { taskDir: TASK_DIR, out: outA, log: (...a) => logsA.push(a.join(' ')) });
const outB = path.join(DIR, 'mix-default-b.mp3');
const resB = runMix(TASK, { taskDir: TASK_DIR, out: outB, log: () => {} });
check('两次混音逐字节相同（同输入 → 同一个 mp3）', sha(outA) === sha(outB),
  `sha ${sha(outA)} / ${sha(outB)}`);
check('返回值里 target = null（没开归一化）', resA.target === null, String(resA.target));
check('返回值里 after = null、normalized = false（**没有**偷偷跑第二遍）',
  resA.after === null && resA.normalized === false, `after=${String(resA.after)} normalized=${resA.normalized}`);
check('before 仍然是那次测量（只读，不改文件）', !!resA.before && Number.isFinite(resA.before.i),
  resA.before ? `${resA.before.i.toFixed(2)} LUFS` : '(null)');
// ⚠ 只断言"没有归一化那几行"，不能断言"输出里没有'归一化'这个词"：默认路径本来就会打印
//   「主流平台归一化目标」这句（media.mjs 的既有措辞），拿整词去扫会误伤自己。
check('打印里**没有**归一化那几行（默认路径的日志与改动前一致）',
  !/· 归一化|归一化前|归一化计划|归一化没成/.test(logsA.join('\n')) && /响度/.test(logsA.join('\n')),
  logsA.filter((l) => /响度|· 归一化/.test(l)).join(' | ').slice(0, 120));

const outOff = path.join(DIR, 'mix-off.mp3');
const resOff = runMix(TASK, { taskDir: TASK_DIR, out: outOff, target: 'off', log: () => {} });
check('显式 --target off 与"不传"完全等价（同一个字节）', sha(outOff) === sha(outA),
  `${sha(outOff)} vs ${sha(outA)}`);
check('  off 的返回值也是 target = null / normalized = false', resOff.target === null && !resOff.normalized);

/* ── 5. **开** target：同一个夹具会被拉上去，并且打印 before → after ── */
console.log('\n⑤ anim mix --target streaming：真的改了音轨，而且报得出来');
const outT = path.join(DIR, 'mix-target.mp3');
const logsT = [];
const resT = runMix(TASK, { taskDir: TASK_DIR, out: outT, target: 'streaming', log: (...a) => logsT.push(a.join(' ')) });
const txtT = logsT.join('\n');
console.log(txtT.split('\n').filter((l) => /归一化|靶子/.test(l)).map((l) => '     ' + l.trim()).join('\n'));
check('返回值带上了 target / before / after / normalized 四个新字段',
  !!resT.target && resT.target.i === -14 && !!resT.before && !!resT.after && resT.normalized === true,
  JSON.stringify({ target: resT.target, before: resT.before?.i, after: resT.after?.i, normalized: resT.normalized }));
check('after 落在 −14 LUFS 的 ±1 LU 内', Math.abs(resT.after.i - -14) <= 1.0,
  `${resT.before.i.toFixed(2)} → ${resT.after.i.toFixed(2)} LUFS`);
check('target 模式下的字节与默认模式**不同**（说明第二遍真的跑了）', sha(outT) !== sha(outA),
  `${sha(outT)} vs ${sha(outA)}`);
check('打印出 before → after 与"是否达标"（人能看懂，不是只有数字）',
  /归一化[:：].*→.*（两遍|单遍/.test(txtT) && /达标/.test(txtT),
  txtT.split('\n').find((l) => /达标/.test(l))?.trim().slice(0, 100) ?? '(没有)');
check('打印里点名了 linear 还是 dynamic（"做了什么"必须说清）', /linear|dynamic/.test(txtT),
  txtT.split('\n').find((l) => /linear|dynamic/.test(l))?.trim().slice(0, 120) ?? '(没有)');
check('时长没有被归一化改掉', Math.abs(probeDuration(outT) - probeDuration(outA)) <= 0.1,
  `${probeDuration(outT).toFixed(2)} vs ${probeDuration(outA).toFixed(2)}`);
const outT2 = path.join(DIR, 'mix-target-2.mp3');
runMix(TASK, { taskDir: TASK_DIR, out: outT2, target: 'streaming', log: () => {} });
check('同一份输入 + 同一个 target 跑两次，产物逐字节相同（可重跑）', sha(outT) === sha(outT2),
  `${sha(outT)} / ${sha(outT2)}`);

/* ── 收尾 ── */
console.log(`\n${'─'.repeat(64)}`);
console.log(`通过 ${pass}/${pass + fail}${fail ? `　❌ 失败 ${fail}` : '　✅ 全部通过'}`);
console.log(`夹具在 ${DIR}（os.tmpdir()，**没有往仓库里写任何文件**）`);
process.exit(fail ? 1 : 0);
