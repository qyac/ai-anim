/**
 * 事件密度判据的离线回归（不需要 GPU / 不需要成片素材）。
 *
 *   node tools/test-event-density.mjs
 *
 * 做法：用 ffmpeg 造两段片 —— `color`（纯静止）与 `testsrc2`（持续运动），
 * 拼成一支 6 秒的假片，要求工具把「静止跨度」和「稀薄窗口」两件事分开报对。
 * 这条测试挡的是：阈值被随手改松、或者量法退化成"只看平均"。
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ff = (args) => spawnSync(process.env.ANIM_FFMPEG || 'ffmpeg', args, { encoding: 'utf8' });
const tmp = mkdtempSync(path.join(tmpdir(), 'anim-energy-'));
const still = path.join(tmp, 'still.mp4');
const motion = path.join(tmp, 'motion.mp4');
const mixed = path.join(tmp, 'mixed.mp4');

let pass = 0, fail = 0;
const ok = (cond, msg, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + msg); }
  else { fail++; console.log('  FAIL  ' + msg + (detail ? '\n          -> ' + detail : '')); }
};

// 3 秒纯静止 + 3 秒持续运动
ok(ff(['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=320x180:d=5:r=20', '-pix_fmt', 'yuv420p', still]).status === 0, '造静止片段（5 秒，必须超过 3.5s 判据）');
ok(ff(['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=3:r=20', '-pix_fmt', 'yuv420p', motion]).status === 0, '造运动片段');
ok(ff(['-v', 'error', '-y', '-i', still, '-i', motion, '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0', '-pix_fmt', 'yuv420p', mixed]).status === 0, '拼接成 6 秒');

const run = (file) => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'lint-event-density.mjs'), '--file', file, '--json'], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch { return null; }
};

console.log('');
console.log('事件密度判据：');
const j = run(mixed);
ok(!!j, '工具跑通并输出 JSON');
if (j) {
  ok(j.duration > 7.4 && j.duration < 8.6, `时长 ${j.duration}s（期望 ≈8s：静止 5s + 运动 3s）`);
  ok(j.staticSpan >= 4.2 && j.staticSpan <= 5.4, `静止跨度 ${j.staticSpan}s（期望 ≈5s：前半段完全不动）`, '没识别出连续静止');
  ok(j.problems.length > 0, '混合片必须报问题（5s 静止 ⇒ 静止跨度超 3.5s）', '判据太松');
}

// 纯静止片：必须报问题（静止跨度 ≈ 全长）
const js = run(still);
ok(!!js, '纯静止片也能跑通');
if (js) ok(js.problems.length > 0, '纯静止片必须报问题（静止跨度 ' + js.staticSpan + 's）', '判据太松，静止片都放过了');

// 纯运动片：不该报静止
const jm = run(motion);
ok(!!jm, '纯运动片能跑通');
if (jm) ok(jm.staticSpan < 1.0, '纯运动片静止跨度 ' + jm.staticSpan + 's（应 < 1s）', '把持续运动误判成静止');

rmSync(tmp, { recursive: true, force: true });
console.log('');
console.log(fail ? `+ ${fail} 项失败` : `+ 全部通过（${pass} 项）`);
process.exitCode = fail ? 1 : 0;
