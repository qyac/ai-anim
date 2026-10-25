#!/usr/bin/env node
// @ts-check
/**
 * 《把信号拆开》的配乐床：72bpm / A 小调 / 72.5 秒，纯合成、**确定性**（同一个 seed 永远同一串数）。
 *
 *   node scripts/make-spectrum-audio.mjs          # 出 tasks/spectrum/audio/bed.wav + bed.mp3
 *
 * 为什么 72bpm：tasks/spectrum/narration.mjs 写死 BPM = 72（一拍 0.8333s），
 * anim say 的段长按整拍取整 —— 切点都落在拍上。
 *
 * 编排跟着旁白的情绪走（段起点取自 audio/timing.json）：
 *   0–9.17s    hook：一记低沉的底鼓 + 一条单音，留白（"它由什么组成"要空）
 *   9.17–20.8  series：每两拍加一个高音，越来越密（"圆越多"）
 *   20.8–32.5  sound：中频垫音，柔和
 *   32.5–44.2  image：加入细碎的踩镲（"切成小块"）
 *   44.2–55    keep：低频加重，高频抽掉再回来
 *   55–64.2    sample：故意"采样不足"—— 一个音被切成台阶
 *   64.2–72.5  outro：收掉一切，长垫 + 一记重击，淡出
 *
 * 铁律：**不许用 Math.random()**，噪声来自 xorshift32。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tasks', 'spectrum', 'audio');
const SR = 44100;
const DUR = 76.5;
const BPM = 72;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const N = Math.round(DUR * SR);

/** 段起点（秒）—— 与 audio/timing.json 一致 */
const SEG = [0, 9.167, 24.167, 35.833, 47.5, 59.167, 67.5];

let s = 0x9e3779b9;
function rnd() {
  s ^= s << 13; s >>>= 0;
  s ^= s >> 17;
  s ^= s << 5; s >>>= 0;
  return s / 4294967296;
}

const L = new Float32Array(N);
const R = new Float32Array(N);

/** 段内进度 0..1（不在段里 = -1） */
function segOf(t) {
  for (let i = SEG.length - 1; i >= 0; i--) if (t >= SEG[i]) return i;
  return 0;
}

/* ── 一记底鼓 ── */
function kick(at, amp) {
  const i0 = Math.round(at * SR);
  const len = Math.round(0.34 * SR);
  for (let k = 0; k < len; k++) {
    const i = i0 + k;
    if (i < 0 || i >= N) continue;
    const tt = k / SR;
    const env = Math.exp(-tt * 11);
    const f = 46 + 84 * Math.exp(-tt * 26);
    const v = Math.sin(2 * Math.PI * f * tt) * env * amp;
    L[i] += v; R[i] += v;
  }
}

/* ── 一记踩镲（确定性噪声） ── */
function hat(at, amp) {
  const i0 = Math.round(at * SR);
  const len = Math.round(0.05 * SR);
  let prev = 0;
  for (let k = 0; k < len; k++) {
    const i = i0 + k;
    if (i < 0 || i >= N) continue;
    const tt = k / SR;
    const env = Math.exp(-tt * 90);
    const n = rnd() * 2 - 1;
    const hi = n - prev * 0.86;
    prev = n;
    const v = hi * env * amp;
    L[i] += v * 0.9; R[i] += v * 1.0;
  }
}

/* ── 一个持续音（带轻微失谐，两个振荡器） ── */
function tone(at, dur, freq, amp, { attack = 0.06, release = 0.5 } = {}) {
  const i0 = Math.round(at * SR);
  const len = Math.round(dur * SR);
  for (let k = 0; k < len; k++) {
    const i = i0 + k;
    if (i < 0 || i >= N) continue;
    const tt = k / SR;
    const a = Math.min(1, tt / attack);
    const r = Math.min(1, (dur - tt) / release);
    const env = a * r;
    const v = (Math.sin(2 * Math.PI * freq * tt) * 0.62
      + Math.sin(2 * Math.PI * freq * 1.004 * tt) * 0.38) * env * amp;
    L[i] += v * 0.92; R[i] += v;
  }
}

/* ── 一条低音垫（全片铺底，随段变化） ── */
function pad(at, dur, freq, amp) {
  const i0 = Math.round(at * SR);
  const len = Math.round(dur * SR);
  for (let k = 0; k < len; k++) {
    const i = i0 + k;
    if (i < 0 || i >= N) continue;
    const tt = k / SR;
    const fade = Math.min(1, tt / 1.2) * Math.min(1, (dur - tt) / 1.2);
    const v = (Math.sin(2 * Math.PI * freq * tt)
      + Math.sin(2 * Math.PI * freq * 2 * tt) * 0.14) * fade * amp;
    L[i] += v; R[i] += v;
  }
}

/* ── A 小调的音高 ── */
const A2 = 110, C3 = 130.81, E3 = 164.81, G3 = 196, A3 = 220, C4 = 261.63, E4 = 329.63, A4 = 440;

/* ============ 编排 ============ */
// 全片的低音垫：整段铺满，段落切换时换音
pad(0, 9.167, A2, 0.10);
pad(9.167, 11.666, A2, 0.11);
pad(20.833, 11.667, C3, 0.11);
pad(32.5, 11.667, E3, 0.11);
pad(44.167, 10.833, G3, 0.12);
pad(55, 9.167, A2, 0.10);
pad(64.167, 8.333, A2, 0.13);

// hook：一记底鼓 + 一条单音，留白
kick(0.05, 0.55);
tone(0.05, 3.4, A3, 0.16, { attack: 0.02, release: 2.2 });

// series：每两拍加一个高音，越来越密（"圆越多"）
for (let b = 0; b < 14; b++) {
  const at = SEG[1] + b * BEAT * (b < 6 ? 2 : 1);
  if (at >= SEG[2]) break;
  tone(at, 0.42, [A4, C4, E4, A3][b % 4], 0.10 + b * 0.006, { attack: 0.01, release: 0.30 });
}
// 第二段结尾一记底鼓落地
kick(SEG[2] - BEAT * 0.5, 0.34);

// sound：柔和的中频垫 + 每两拍一记轻 kick
for (let at = SEG[2]; at < SEG[3]; at += BEAT * 2) kick(at, 0.26);
tone(SEG[2] + 0.2, 5.0, E4, 0.07, { attack: 1.2, release: 2.0 });
tone(SEG[2] + 5.4, 6.2, C4, 0.07, { attack: 1.2, release: 2.4 });

// image：加入细碎的踩镲（"切成小块"）
for (let at = SEG[3]; at < SEG[4]; at += BEAT * 0.5) hat(at, 0.055);
for (let at = SEG[3]; at < SEG[4]; at += BEAT * 2) kick(at, 0.24);
tone(SEG[3] + 0.3, 4.4, G3, 0.08, { attack: 0.8, release: 1.6 });

// keep：低频加重，高频抽掉再回来（就是这一段在讲的事）
for (let at = SEG[4]; at < SEG[5]; at += BEAT) kick(at, 0.20);
pad(SEG[4], 10.8, G3, 0.09);
tone(SEG[4] + 6.0, 4.2, E4, 0.065, { attack: 1.8, release: 1.8 });

// sample：故意"采样不足"—— 一个音被切成台阶（离散化，能听出来）
{
  const at0 = SEG[5] + 0.2, dur = 6.2, steps = 7, f0 = A3, f1 = E4;
  for (let st = 0; st < steps; st++) {
    const f = f0 * Math.pow(f1 / f0, st / (steps - 1));
    tone(at0 + (dur * st) / steps, dur / steps, f, 0.13, { attack: 0.004, release: 0.004 });
  }
}
for (let at = SEG[5]; at < SEG[6]; at += BEAT * 2) kick(at, 0.22);

// outro：收掉一切，长垫 + 一记重击，淡出
tone(SEG[6] + 0.1, 7.6, A3, 0.11, { attack: 0.5, release: 4.0 });
tone(SEG[6] + 0.1, 7.6, E4, 0.07, { attack: 1.4, release: 4.0 });
kick(SEG[6] + 0.08, 0.62);

/* ── 全片淡出 + 归一化 ── */
const FADE = 2.6;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const tail = Math.min(1, (DUR - t) / FADE);
  L[i] *= tail; R[i] *= tail;
}
let peak = 1e-9;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.90 / peak;
for (let i = 0; i < N; i++) { L[i] *= g; R[i] *= g; }

/* ── 写 wav（16bit 立体声） ── */
mkdirSync(OUT, { recursive: true });
const wav = Buffer.alloc(44 + N * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const l = Math.max(-1, Math.min(1, L[i]));
  const r = Math.max(-1, Math.min(1, R[i]));
  wav.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
}
const wavPath = path.join(OUT, 'bed.wav');
writeFileSync(wavPath, wav);

const mp3Path = path.join(OUT, 'bed.mp3');
/**
 * 响度：`anim mix` **只报数字、不自动归一化**（那会让所有已交付片子重出，见 scripts/lib/mix.mjs:216）。
 * 所以把靶子做进配乐床这一步：先编码，量一次，再按差值重编码到 -19 LUFS
 * （留 5 LU 余量给旁白闪避 —— 混完的目标是 -14 LUFS / -1 dBTP）。
 */
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wavPath, '-codec:a', 'libmp3lame', '-q:a', '2', mp3Path]);
const measure = () => {
  const err = execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-i', mp3Path, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return err;
};
try {
  // loudnorm 把 JSON 写在 stderr；execFileSync 成功时拿不到 stderr，用 spawnSync 更省事
  const { spawnSync } = require('node:child_process');
  void spawnSync; void measure;
} catch { /* 忽略 */ }
const { spawnSync } = await import('node:child_process');
const probe = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', mp3Path, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
const m = /"input_i"\s*:\s*"(-?[0-9.]+)"/.exec(probe.stderr ?? '');
if (m) {
  const cur = Number(m[1]);
  const gainDb = -16.5 - cur;
  if (Math.abs(gainDb) > 0.3) {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wavPath, '-af', `volume=${gainDb.toFixed(2)}dB`, '-codec:a', 'libmp3lame', '-q:a', '2', mp3Path]);
    console.log(`  响度 ${cur.toFixed(1)} LUFS → 拉到 -16.5 LUFS（${gainDb > 0 ? '+' : ''}${gainDb.toFixed(2)} dB）`);
  }
} else {
  console.log('  ⚠ 没量到响度（loudnorm 没输出 JSON）—— 配乐床保持原样');
}
console.log(`✓ ${wavPath}`);
console.log(`✓ ${mp3Path}  (${DUR}s / ${BPM}bpm / peak ${(g * peak).toFixed(3)})`);