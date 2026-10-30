// `--pin-timing` 的端到端验收（BACKLOG 1-23）：真跑 `anim say`（假 TTS 驱动），
// 比对三次的 audio/timing.json —— 验的是「改一句词，时间线会不会整条挪位」。
//
//   node tools/test-pin-timing-e2e.mjs
//
// 需要 ffmpeg（假驱动用 anullsrc 生成静音 mp3）；不需要 GPU、不需要联网、不需要真 TTS。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TASK = '_say-pin-lab';
const NARR = join(ROOT, 'tasks', TASK, 'narration.mjs');
const TIMING = join(ROOT, 'tasks', TASK, 'audio', 'timing.json');
const TTS = 'node tools/fake-tts.mjs';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '\n          → ' + detail : '')); }
};

const say = (extra = '') => execFileSync(process.execPath,
  ['scripts/anim.mjs', 'say', TASK, '--tts', TTS, ...extra.split(' ').filter(Boolean)],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const readTiming = () => JSON.parse(readFileSync(TIMING, 'utf8'));
const orig = readFileSync(NARR, 'utf8');
// 三份产物跑之前的原样快照（不存在就记 null ⇒ 跑完删掉，别凭空多出一个文件）
const snapshot = (rel) => {
  const p = join(ROOT, 'tasks', TASK, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};
const timingOrig = snapshot('audio/timing.json');
const timingMjsOrig = snapshot('audio/timing.mjs');
const narrationOrig = snapshot('audio/narration.json');

try {
  console.log('--pin-timing 端到端（真跑 anim say + 假 TTS）：');

  console.log('\n§1 首版（正常解）');
  say();
  const t1 = readTiming();
  check('写出两段', t1.scenes.length === 2, JSON.stringify(t1.scenes.map((s) => s.id)));
  const slots1 = t1.scenes.map((s) => s.slot);
  const stretch1 = t1.scenes.map((s) => s.stretch);
  console.log('    slot=' + JSON.stringify(slots1) + ' stretch=' + JSON.stringify(stretch1));

  console.log('\n§2 只改短一句 ⇒ 全钉住，时间线逐位不动');
  writeFileSync(NARR, orig.replace('这串声音，叫旁白。', '这叫旁白。'));
  const out2 = say('--pin-timing');
  const t2 = readTiming();
  check('slot 与首版逐位相等', JSON.stringify(t2.scenes.map((s) => s.slot)) === JSON.stringify(slots1),
    JSON.stringify(t2.scenes.map((s) => s.slot)));
  check('stretch 与首版逐位相等', JSON.stringify(t2.scenes.map((s) => s.stretch)) === JSON.stringify(stretch1));
  check('总时长与首版相等', t2.total === t1.total, JSON.stringify([t2.total, t1.total]));
  check('日志说「钉住 2 段」', /钉住 2 段/.test(out2), out2.split('\n').filter((l) => l.includes('钉住')).join(' | '));

  console.log('\n§3 把一句改长很多 ⇒ 只重解那一段并警告');
  writeFileSync(NARR, orig.replace('不是平摊。', '不是按段数平摊，而是让每一段自己说话，画面跟着声音走，说完再留一会儿。'));
  const out3 = say('--pin-timing');
  const t3 = readTiming();
  check('first 段被钉住（slot 不变）', t3.scenes[0].slot === slots1[0], JSON.stringify(t3.scenes[0].slot));
  check('second 段被重解（slot 变大）', t3.scenes[1].slot > slots1[1],
    JSON.stringify([t3.scenes[1].slot, slots1[1]]));
  check('日志点名重解的那一段', /重解 1 段.*second|second.*重解/.test(out3.replace(/\n/g, ' ')),
    out3.split('\n').filter((l) => l.includes('重解')).join(' | '));
  check('警告说清「放不进原来的 slot」', /放不进原来的 slot/.test(out3));
} finally {
  // ⚠ 这个夹具的产物**是入库的**（`audio/timing.{json,mjs}` 与 `narration.json` 都被任务
  //   `task.config.mjs` 直接引用，见 .gitignore 里那条"必须入库"的注释）。所以跑完必须**原样还原**，
  //   否则跑一次回归就把工作区弄脏、下一次 `git commit -a` 会顺手提交一份假的时长表。
  //   以前这里只把 timing.json 复制成 .bak（既没还原它、也没管另两份），本轮修掉。
  writeFileSync(NARR, orig);
  for (const f of [
    ['audio/timing.json', timingOrig],
    ['audio/timing.mjs', timingMjsOrig],
    ['audio/narration.json', narrationOrig],
  ]) {
    const p = join(ROOT, 'tasks', TASK, f[0]);
    if (f[1] === null) rmSync(p, { force: true });
    else writeFileSync(p, f[1]);
  }
}

console.log(fail ? '\n✗ 有 ' + fail + ' 项失败' : '\n✓ 全部通过（' + pass + ' 项）');
process.exitCode = fail ? 1 : 0;