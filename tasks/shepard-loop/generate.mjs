import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { envelope, spec, steppedSample, steppedSpectrum, stepTiming, sweepSample, sweepSpectrum } from './signal.mjs';

if (!process.argv[2]) throw new Error('Usage: node generate.mjs <output-directory>');
const out = resolve(process.argv[2]);
for (const dir of ['audio', 'data', 'svg']) mkdirSync(resolve(out, dir), { recursive: true });
const write = (path, data) => writeFileSync(resolve(out, path), data);
const writeJson = (path, data) => write(path, JSON.stringify(data, null, 2) + '\n');
const samples = (count, fn) => Array.from({ length: count }, (_, index) => fn(index));
const noteSeconds = spec.octaveSeconds / spec.notesPerOctave;

function writeWav(path, sampleAt) {
  const sampleCount = spec.duration * spec.sampleRate;
  const cycleSamples = spec.octaveSeconds * spec.sampleRate;
  if (sampleCount % cycleSamples !== 0) throw new RangeError('Audio length must contain whole octave cycles');
  const dataBytes = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(spec.sampleRate, 24);
  wav.writeUInt32LE(spec.sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < cycleSamples; i++) {
    wav.writeInt16LE(Math.round(sampleAt(i / spec.sampleRate) * 32767), 44 + i * 2);
  }
  for (let offset = cycleSamples; offset < sampleCount; offset += cycleSamples) {
    wav.copy(wav, 44 + offset * 2, 44, 44 + cycleSamples * 2);
  }
  write(path, wav);
}

writeWav('audio/shepard-steps-35s.wav', steppedSample);
writeWav('audio/shepard-risset-sweep-35s.wav', sweepSample);

const fps = 60;
const spectrumRows = ['time_s,band,octaves_from_low,frequency_hz,envelope_amplitude'];
for (let i = 0; i <= fps * spec.octaveSeconds; i++) {
  const time = i / fps;
  for (const { band, octave, frequencyHz, amplitude } of sweepSpectrum(time)) {
    spectrumRows.push([time.toFixed(9), band, octave.toFixed(9), frequencyHz.toFixed(6), amplitude.toFixed(9)].join(','));
  }
}
write('data/sweep-spectrum-60fps.csv', spectrumRows.join('\n') + '\n');

writeJson('data/step-spectrum.json', {
  ...spec,
  beatSeconds: noteSeconds,
  amplitudeUnit: 'relative linear oscillator gain before global output gain',
  steps: samples(spec.notesPerOctave, (i) => ({
    pitchClass: i,
    onsetSeconds: noteSeconds * i,
    settledPartials: steppedSpectrum(noteSeconds * (i + 0.5)),
  })),
});

const windowStart = 1.25;
const windowSeconds = 0.020;
const waveform = samples(windowSeconds * spec.sampleRate + 1, (i) => {
  const time = i / spec.sampleRate;
  return { time, sweep: sweepSample(windowStart + time), stepped: steppedSample(windowStart + time) };
});
write('data/waveform-20ms.csv', [
  'time_from_excerpt_start_s,continuous_sample,stepped_sample',
  ...waveform.map(({ time, sweep, stepped }) => [time.toFixed(9), sweep.toFixed(9), stepped.toFixed(9)].join(',')),
].join('\n') + '\n');

const cuts = [0, 5, 11, 17, 23, 29, 35];
const loopCycles = spec.duration / spec.octaveSeconds;
writeJson('data/sync-35s.json', {
  ...spec, fps, loopCycles, beatSeconds: noteSeconds,
  cutsSeconds: cuts,
  octaveBoundariesSeconds: samples(loopCycles + 1, (i) => spec.octaveSeconds * i),
  beatOnsetsSeconds: samples(loopCycles * spec.notesPerOctave, (i) => noteSeconds * i),
  cuePoints: cuts.map((time) => ({ time, ...stepTiming(time) })),
});

const foreground = '#eff7ff';
const label = '#b7c9d9';
const cyan = '#6cddff';
const grid = '#71879b';
const round = (n) => Number(n.toFixed(4));
const line = (x1, y1, x2, y2, attrs = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`;
const text = (x, y, value, attrs = '') => `<text x="${x}" y="${y}" ${attrs}>${value}</text>`;
const labelAttrs = `fill="${label}" font-size="20"`;
const title = (value) => text(64, 52, value, `fill="${foreground}" font-size="34" font-weight="700"`);
const axisY = (q) => 466 - q * 46;
const axisX = (origin, length, fraction) => round(origin + length * fraction);
const gridAttrs = `stroke="${grid}" stroke-opacity="0.46"`;

function writeSvg(name, width, height, elements) {
  const body = elements.map((item) => '    ' + item).join('\n');
  write('svg/' + name + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <g font-family="Microsoft YaHei, PingFang SC, sans-serif">
${body}
  </g>
</svg>\n`);
}

function frequencyTicks(right) {
  return samples(spec.octaves + 1, (q) => q).flatMap((q) => {
    const y = axisY(q);
    return [line(132, y, right, y, gridAttrs), text(116, y + 7, spec.lowHz * 2 ** q, `${labelAttrs} text-anchor="end"`)];
  });
}

function opacityStops(fn, color, count = 33) {
  return samples(count, (index) => {
    const u = index / (count - 1);
    return `<stop offset="${round(u * 100)}%" stop-color="${color}" stop-opacity="${round(fn(u))}"/>`;
  }).join('');
}

const trackGradients = samples(spec.octaves, (band) =>
  `<linearGradient id="sweep-${band}" x1="0%" x2="100%">${opacityStops((u) => envelope(band + u), cyan)}</linearGradient>`);
writeSvg('frequency-tracks', 1120, 548, [
  title('八度分量与频率循环'),
  text(116, 82, 'Hz', `${labelAttrs} text-anchor="end"`),
  ...frequencyTicks(1068),
  `<defs>${trackGradients.join('')}</defs>`,
  ...samples(spec.octaves, (band) => line(132, axisY(band), 1068, axisY(band + 1),
    `stroke="url(#sweep-${band})" stroke-width="7" stroke-linecap="round"`)),
  ...samples(5, (i) => text(axisX(132, 936, i / 4), 497, `${spec.octaveSeconds * i / 4} s`, `${labelAttrs} text-anchor="middle"`)),
  text(600, 530, '对数频率纵轴 · 线条透明度对应分量振幅', `${labelAttrs} text-anchor="middle"`),
]);

const envelopePath = samples(129, (i) => {
  const q = spec.octaves * i / 128;
  return `${i === 0 ? 'M' : 'L'} ${axisX(132, 600, envelope(q))} ${round(axisY(q))}`;
}).join(' ');
writeSvg('amplitude-envelope', 795, 548, [
  title('固定在频率轴上的音量包络'),
  text(116, 82, 'Hz', `${labelAttrs} text-anchor="end"`),
  ...frequencyTicks(732),
  `<path d="${envelopePath}" fill="none" stroke="${cyan}" stroke-width="5" stroke-linejoin="round"/>`,
  ...samples(5, (i) => text(axisX(132, 600, i / 4), 497, `${i * 25}%`, `${labelAttrs} text-anchor="middle"`)),
  text(432, 530, '相对振幅（线性刻度）', `${labelAttrs} text-anchor="middle"`),
]);

writeSvg('frequency-ruler', 192, 548, [
  text(116, 82, 'Hz', `${labelAttrs} text-anchor="end"`),
  ...frequencyTicks(175),
  line(132, axisY(0), 132, axisY(spec.octaves), `stroke="${label}"`),
]);

writeSvg('pitch-strip', 900, 48, [
  `<defs><linearGradient id="strip-fill"><stop offset="0%" stop-color="${cyan}" stop-opacity="0.15"/><stop offset="14%" stop-color="${cyan}"/><stop offset="86%" stop-color="${cyan}"/><stop offset="100%" stop-color="${cyan}" stop-opacity="0.15"/></linearGradient></defs>`,
  '<rect x="0" y="0" width="900" height="48" rx="24" fill="url(#strip-fill)"/>',
]);

writeSvg('amplitude-mask', 900, 368, [
  `<defs><linearGradient id="vertical-taper" x1="0%" x2="0%" y1="0%" y2="100%">${opacityStops((u) => envelope(spec.octaves * (1 - u)), '#fff')}</linearGradient></defs>`,
  '<rect x="0" y="0" width="900" height="368" fill="url(#vertical-taper)"/>',
]);

const waveformX = (t) => axisX(100, 968, t / windowSeconds);
const waveY = (sample) => round(278 - sample * 165);
const wavPath = waveform.map(({ time, sweep }, i) => `${i === 0 ? 'M' : 'L'} ${waveformX(time)} ${waveY(sweep)}`).join(' ');
writeSvg('waveform-20ms', 1120, 510, [
  title('连续滑音的波形截面'),
  ...[-1, -0.5, 0, 0.5, 1].flatMap((value) => [
    line(100, waveY(value), 1068, waveY(value), gridAttrs),
    text(83, waveY(value) + 7, value, `${labelAttrs} text-anchor="end"`),
  ]),
  `<path d="${wavPath}" fill="none" stroke="${cyan}" stroke-width="2.5" stroke-linejoin="round"/>`,
  ...samples(5, (i) => text(waveformX(i * windowSeconds / 4), 483, `${i * 5} ms`, `${labelAttrs} text-anchor="middle"`)),
]);
