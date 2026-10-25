#!/usr/bin/env node
// @ts-check
/**
 * 把混好的音轨拉到平台靶子（-14 LUFS / -1 dBTP）。
 *
 * 为什么需要这一步：`anim mix` **只报数字、不自动归一化** —— 那是引擎的既定决定
 * （归一化会让所有已交付片子的音轨都变，`scripts/lib/mix.mjs:216`）。
 * 所以"这支片子要贴靶子"是**任务级**的动作，放在脚本里，不动引擎。
 *
 *   node scripts/master-spectrum-audio.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const FILE = path.join('tasks', 'spectrum', 'audio', 'spectrum-mix.mp3');
const TARGET_I = -14.0;
const TARGET_TP = -1.0;

const probe = spawnSync('ffmpeg', [
  '-hide_banner', '-nostats', '-i', FILE,
  '-af', 'loudnorm=print_format=json', '-f', 'null', '-',
], { encoding: 'utf8' });
const err = probe.stderr ?? '';
const num = (k) => Number((new RegExp(`"${k}"\\s*:\\s*"(-?[0-9.]+)"`).exec(err) ?? [])[1]);
const curI = num('input_i');
const curTP = num('input_tp');
if (!Number.isFinite(curI)) {
  console.error('✗ 没量到响度（loudnorm 没输出 JSON）');
  process.exit(1);
}

/**
 * ⚠ 单纯加增益会撞真峰上限：实测这支片子的峰值比积分响度高得多（-3 dBTP 对 -21 LUFS），
 * 直接补到 -14 会让真峰到 +4.2 dBTP。所以要**先压动态再拉**——
 * 用 loudnorm 的两遍式（它内部就包含动态压缩），而不是裸 volume。
 */
const tmp = FILE.replace(/\.mp3$/, '.mastered.mp3');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', FILE,
  '-af', `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=11:print_format=summary`,
  '-ar', '48000', '-codec:a', 'libmp3lame', '-q:a', '2', tmp]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', tmp, '-codec:a', 'copy', FILE]);
execFileSync('rm', ['-f', tmp]);

const after = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', FILE, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
const e2 = after.stderr ?? '';
const n2 = (k) => Number((new RegExp(`"${k}"\\s*:\\s*"(-?[0-9.]+)"`).exec(e2) ?? [])[1]);
console.log(`✓ ${FILE}`);
console.log(`  ${curI.toFixed(1)} LUFS / ${curTP.toFixed(2)} dBTP  →  ${n2('input_i').toFixed(1)} LUFS / ${n2('input_tp').toFixed(2)} dBTP`);
console.log(`  靶子 ${TARGET_I} LUFS / ${TARGET_TP} dBTP`);