#!/usr/bin/env node
// 从真实音频里抽一段 PCM 波形，存成 JSON 给场景用（不做任何合成/美化）。
//   node scripts/extract-spectrum-wave.mjs
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SRC = 'tasks/spectrum/audio/bed.mp3';
const OUT = 'tasks/spectrum/audio/wave.json';
const SR = 8000;          // 只为了画图，8k 采样足够
const T0 = 20.8;          // 第 3 段开头（sound）
const DUR = 2.4;

const buf = execFileSync('ffmpeg', [
  '-v', 'error', '-ss', String(T0), '-t', String(DUR), '-i', SRC,
  '-ac', '1', '-ar', String(SR), '-f', 's16le', '-',
], { maxBuffer: 64 * 1024 * 1024 });

const n = Math.floor(buf.length / 2);
const pcm = new Float32Array(n);
for (let i = 0; i < n; i++) pcm[i] = buf.readInt16LE(i * 2) / 32768;

let peak = 0;
for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(pcm[i]));

// 保留 420 个点（每点取该窗内的极值，这样包络不会被采样丢掉）
const PTS = 420;
const step = n / PTS;
const ys = [];
for (let i = 0; i < PTS; i++) {
  const a = Math.floor(i * step), b = Math.floor((i + 1) * step);
  let mx = -1, mn = 1;
  for (let j = a; j < b && j < n; j++) { mx = Math.max(mx, pcm[j]); mn = Math.min(mn, pcm[j]); }
  ys.push([Number(mn.toFixed(4)), Number(mx.toFixed(4))]);
}

writeFileSync(OUT, JSON.stringify({
  source: SRC, at: T0, dur: DUR, sampleRate: SR, peak: Number(peak.toFixed(4)),
  note: '每项 = [该窗最小, 该窗最大]，直接来自 ffmpeg 解码的 PCM，未做任何合成',
  points: ys,
}));
console.log(`✓ ${OUT}  ${PTS} 点  peak ${peak.toFixed(3)}  源 ${SRC} @ ${T0}s+${DUR}s`);
