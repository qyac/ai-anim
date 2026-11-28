export const example = Object.freeze({ modulus: 17n, generator: 3n, aliceExponent: 4n, bobExponent: 6n });
export const clock = Object.freeze({ size: 960, center: 480, trackRadius: 335, modulus: 17 });

function reduce(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

// BigInt arithmetic for the animation's mathematical examples.
export function modPow(base, exponent, modulus) {
  if (modulus < 2n || exponent < 0n) throw new RangeError('Expected modulus >= 2 and exponent >= 0');
  let residue = 1n;
  let factor = reduce(base, modulus);
  for (let remaining = exponent; remaining > 0n; remaining >>= 1n) {
    if ((remaining & 1n) === 1n) residue = (residue * factor) % modulus;
    factor = (factor * factor) % modulus;
  }
  return residue;
}

// Each row is one multiplication on the clock, beginning at base^0 = 1.
export function powerTrail(base, steps, modulus) {
  if (modulus < 2n || !Number.isSafeInteger(steps) || steps < 0) throw new RangeError('Invalid modulus or visual step count');
  let residue = 1n;
  const factor = reduce(base, modulus);
  const rows = [{ step: 0, from: null, product: null, residue }];
  for (let step = 1; step <= steps; step++) {
    const from = residue;
    const product = from * factor;
    residue = product % modulus;
    rows.push({ step, from, product, residue });
  }
  return rows;
}

export function clockPoint(residue, radius = clock.trackRadius) {
  const angle = Math.PI * (2 * residue / clock.modulus - 0.5);
  return { x: clock.center + radius * Math.cos(angle), y: clock.center + radius * Math.sin(angle) };
}

export function clockJump(from, to, bend = 0.16) {
  const start = clockPoint(from);
  const end = clockPoint(to);
  // Offset the midpoint perpendicular to the chord so reversed jumps use distinct lanes.
  const control = {
    x: (start.x + end.x) / 2 - (end.y - start.y) * bend,
    y: (start.y + end.y) / 2 + (end.x - start.x) * bend,
  };
  return { start, control, end };
}

export function jumpPoint(from, to, progress, bend = 0.16) {
  const { start, control, end } = clockJump(from, to, bend);
  const u = 1 - progress;
  return {
    x: u ** 2 * start.x + 2 * u * progress * control.x + progress ** 2 * end.x,
    y: u ** 2 * start.y + 2 * u * progress * control.y + progress ** 2 * end.y,
  };
}
