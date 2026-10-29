/**
 * tempo 估计的离线回归（BACKLOG：analyze 的 bpm 估计偏 4%）。
 *
 *   node tools/test-tempo.mjs
 *
 * 为什么值得单测：bpm 进 analysis.json → 进 f.beat / music.beatAt() → 决定所有「踩拍」画面的时间轴。
 * 而它错了不报错，只会让整片轻飘飘地偏半拍（实测合成床 80bpm 被报成 83.3，偏 4%）。
 *
 * 测法：合成一段已知 bpm 的鼓（底鼓 + 半拍踩镲 + 贝斯），跑 analyzePCM，看它能不能把 bpm 认回来。
 * 半拍踩镲是刻意的诱饵：上一版就曾被它带成 97.6bpm（把半拍当一拍）。
 */
const { analyzePCM } = await import('../src/core/audio-analysis.js');

let pass = 0, fail = 0;
const ok = (cond, msg, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + msg); }
  else { fail++; console.log('  FAIL  ' + msg + (detail ? '\n          -> ' + detail : '')); }
};

const SR = 22050;
function drumTrack(bpm, seconds = 16, opts = {}) {
  const hats = opts.hats !== false, bass = opts.bass !== false;
  const n = Math.round(seconds * SR);
  const pcm = new Float32Array(n);
  const beat = 60 / bpm;
  const addKick = (t0) => {
    for (let i = 0; i < 0.12 * SR; i++) {
      const t = i / SR;
      const idx = Math.round(t0 * SR) + i;
      if (idx < 0 || idx >= n) continue;
      const f = 110 * Math.exp(-t * 22) + 45;
      pcm[idx] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 26) * 0.9;
    }
  };
  const addHat = (t0) => {
    let seed = 12345;
    for (let i = 0; i < 0.05 * SR; i++) {
      const t = i / SR;
      const idx = Math.round(t0 * SR) + i;
      if (idx < 0 || idx >= n) continue;
      seed = (seed * 1103515245 + 12345) >>> 0;
      const noise = (seed / 4294967296) * 2 - 1;
      pcm[idx] += noise * Math.exp(-t * 90) * 0.22;
    }
  };
  const addBass = (t0) => {
    for (let i = 0; i < beat * 0.9 * SR; i++) {
      const t = i / SR;
      const idx = Math.round(t0 * SR) + i;
      if (idx < 0 || idx >= n) continue;
      pcm[idx] += Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 2.2) * 0.35;
    }
  };
  for (let b = 0; b * beat < seconds; b++) {
    addKick(b * beat);
    if (hats) addHat(b * beat + beat * 0.5);
    if (bass) addBass(b * beat);
  }
  return pcm;
}

console.log('tempo 估计回归（合成鼓，已知 bpm）：');
console.log('');
for (const bpm of [80, 96, 120, 140]) {
  const a = analyzePCM(drumTrack(bpm), SR);
  const err = Math.abs(a.bpm - bpm) / bpm * 100;
  ok(err <= 0.6, bpm + ' bpm -> 认出 ' + a.bpm.toFixed(2) + '（偏 ' + err.toFixed(2) + '%）', '超出 0.6% 容差');
  const grid = a.beats.length > 2 ? (a.beats[a.beats.length - 1] - a.beats[0]) / (a.beats.length - 1) : 0;
  const gridErr = Math.abs(grid - 60 / bpm) / (60 / bpm) * 100;
  ok(gridErr <= 1.0, '  网格间隔 ' + grid.toFixed(4) + 's（期望 ' + (60 / bpm).toFixed(4) + '，偏 ' + gridErr.toFixed(2) + '%）');
}

console.log('');
console.log('半拍诱饵（底鼓 + 半拍踩镲，无贝斯）：');
{
  const a = analyzePCM(drumTrack(100, 16, { hats: true, bass: false }), SR);
  const r = a.bpm / 100;
  const hit = [1, 2, 0.5].some((k) => Math.abs(r - k) / k <= 0.01);
  ok(hit, '100 bpm + 半拍踩镲 -> ' + a.bpm.toFixed(2) + '（在 100/200/50 的倍频解释内）', '偏离倍数解释');
}

console.log('');
console.log('拍网格置信度（软失败要能判出来）：');
{
  const a = analyzePCM(drumTrack(96), SR);
  ok(a.tempo && a.tempo.score >= 0.8, '合成鼓 96bpm 的置信度 ≥0.8（实测 ' + (a.tempo ? a.tempo.score.toFixed(2) : 'n/a') + '）');
  // 纯噪声：不该给出"高置信度"的拍网格
  const n = 16 * SR;
  const noise = new Float32Array(n);
  let seed = 7;
  for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) >>> 0; noise[i] = ((seed / 4294967296) * 2 - 1) * 0.3; }
  const b = analyzePCM(noise, SR);
  ok(b.tempo && b.tempo.score < 0.6, '纯噪声的置信度 <0.6（实测 ' + (b.tempo ? b.tempo.score.toFixed(2) : 'n/a') + '）—— 有 bpm 值 ≠ 可信');
  console.log('          （标定：合成鼓 0.85–0.95 / 真音乐 ~0.9 / 噪声 ~0.3）');
}

console.log('');
console.log(fail ? '+ ' + fail + ' 项失败' : '+ 全部通过（' + pass + ' 项）');
process.exitCode = fail ? 1 : 0;
