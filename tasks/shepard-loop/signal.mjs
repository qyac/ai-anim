export const spec = Object.freeze({
  sampleRate: 48000,
  duration: 35,
  octaveSeconds: 7,
  notesPerOctave: 12,
  lowHz: 27.5,
  octaves: 8,
  crossfadeSeconds: 0.036,
  gain: 0.28,
});

const TAU = 2 * Math.PI;
const PHASE_CYCLES_PER_HZ = spec.octaveSeconds / Math.LN2;
const NOTE_SECONDS = spec.octaveSeconds / spec.notesPerOctave;

function wrapTime(time) {
  const cycleTime = time % spec.octaveSeconds;
  const wrapped = cycleTime < 0 ? cycleTime + spec.octaveSeconds : cycleTime;
  return wrapped === spec.octaveSeconds ? 0 : wrapped;
}

// q is the base-2 logarithmic frequency measured from spec.lowHz.
export function envelope(q) {
  if (q <= 0 || q >= spec.octaves) return 0;
  const taper = Math.sin(Math.PI * q / spec.octaves);
  return (taper * taper) ** 2;
}

function partials(phase, mix = 1) {
  return Array.from({ length: spec.octaves }, (_, band) => {
    const octave = band + phase;
    return { band, octave, frequencyHz: spec.lowHz * 2 ** octave, amplitude: mix * envelope(octave) };
  });
}

export function sweepSpectrum(time) {
  return partials(wrapTime(time) / spec.octaveSeconds);
}

function steppedState(time) {
  const scaled = wrapTime(time) * spec.notesPerOctave / spec.octaveSeconds;
  const nearestStep = Math.round(scaled);
  const step = Math.abs(scaled - nearestStep) < 1e-12 ? nearestStep % spec.notesPerOctave : scaled;
  const pitchClass = Math.floor(step);
  const elapsed = (step - pitchClass) * NOTE_SECONDS;
  const blendPhase = Math.min(1, elapsed / spec.crossfadeSeconds);
  return { pitchClass, elapsed, blend: 0.5 - 0.5 * Math.cos(Math.PI * blendPhase) };
}

export function stepTiming(time) {
  const { pitchClass, elapsed } = steppedState(time);
  return { pitchClass, progress: elapsed / NOTE_SECONDS, secondsAfterBeat: elapsed, beatSeconds: NOTE_SECONDS };
}

function previousClass(pitchClass) {
  return (pitchClass + spec.notesPerOctave - 1) % spec.notesPerOctave;
}

export function steppedSpectrum(time) {
  const { pitchClass, blend } = steppedState(time);
  const current = partials(pitchClass / spec.notesPerOctave, blend);
  if (blend === 1) return current;
  return partials(previousClass(pitchClass) / spec.notesPerOctave, 1 - blend).concat(current);
}

export function sweepSample(time) {
  const phase = wrapTime(time) / spec.octaveSeconds;
  let hz = spec.lowHz * 2 ** phase;
  let sample = 0;
  for (let band = 0; band < spec.octaves; band++, hz *= 2) {
    // f(t) is exponential, so 2π * f(t) * octaveSeconds / log(2) has derivative 2π * f(t).
    // The phase depends on physical frequency. Surviving partials match when the octave wraps.
    const phaseCycles = hz * PHASE_CYCLES_PER_HZ;
    sample += envelope(band + phase) * Math.sin(TAU * phaseCycles);
  }
  return spec.gain * sample;
}

const chords = Array.from({ length: spec.notesPerOctave }, (_, pitchClass) => partials(pitchClass / spec.notesPerOctave));

function chordSample(pitchClass, elapsed) {
  let sample = 0;
  for (const partial of chords[pitchClass]) {
    const phaseCycles = partial.frequencyHz * (PHASE_CYCLES_PER_HZ + elapsed);
    sample += partial.amplitude * Math.sin(TAU * phaseCycles);
  }
  return sample;
}

export function steppedSample(time) {
  const { pitchClass, elapsed, blend } = steppedState(time);
  const current = chordSample(pitchClass, elapsed);
  if (blend === 1) return spec.gain * current;
  const previous = chordSample(previousClass(pitchClass), NOTE_SECONDS + elapsed);
  return spec.gain * (previous * (1 - blend) + current * blend);
}
