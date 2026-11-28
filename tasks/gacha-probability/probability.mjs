function checkRate(value, name, allowZero) {
  if (!Number.isFinite(value) || value > 1 || value < 0 || (!allowZero && value === 0)) {
    throw new RangeError(`${name} must be ${allowZero ? 'in [0, 1]' : 'in (0, 1]'}`);
  }
}

function checkCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
}

function checkBag(size, hits) {
  checkCount(size, 'size');
  checkCount(hits, 'hits');
  if (size === 0 || hits > size) throw new RangeError('a bag must contain at least one card and at most size hits');
}

// chooseIndex(bound) must return a uniform integer in [0, bound) for an unbiased shuffle.
// For frame-by-frame playback, supply predetermined choices and read the resulting swaps.
export function fisherYates(items, chooseIndex) {
  const shuffled = [...items];
  const swaps = [];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = chooseIndex(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new RangeError(`shuffle index ${j} is outside [0, ${i}]`);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    swaps.push({ i, j });
  }
  return { items: shuffled, swaps };
}

export function iidMissTail(rate, count) {
  checkRate(rate, 'rate', true);
  checkCount(count, 'count');
  return (1 - rate) ** count;
}

// Each bag has exactly `hits` hits and is shuffled independently. Outcomes before `offset` are unknown.
export function bagMissTail(size, hits, count, offset = 0) {
  checkBag(size, hits);
  checkCount(count, 'count');
  checkCount(offset, 'offset');
  if (offset >= size) throw new RangeError('offset must be smaller than size');
  if (hits === 0) return 1;

  let probability = 1;
  let available = size - offset;
  while (count > 0) {
    const draws = Math.min(count, available);
    if (draws > size - hits) return 0;
    // Any specified set of positions within one shuffled bag has the same marginal distribution.
    for (let i = 0; i < draws; i++) probability *= (size - hits - i) / (size - i);
    count -= draws;
    available = size;
  }
  return probability;
}

export function bagStationaryMissTail(size, hits, count) {
  checkBag(size, hits);
  checkCount(count, 'count');
  let sum = 0;
  for (let offset = 0; offset < size; offset++) sum += bagMissTail(size, hits, count, offset);
  return sum / size;
}

export function bagHitChanceAfterMisses(size, hits, previousMisses) {
  checkBag(size, hits);
  checkCount(previousMisses, 'previousMisses');
  if (previousMisses >= size || previousMisses > size - hits) return null;
  return hits / (size - previousMisses);
}

export function prdHitChance(constant, attempt) {
  checkRate(constant, 'constant', false);
  checkCount(attempt, 'attempt');
  if (attempt === 0) throw new RangeError('attempt starts at 1');
  return Math.min(1, constant * attempt);
}

export function prdMissTail(constant, count, previousMisses = 0) {
  checkRate(constant, 'constant', false);
  checkCount(count, 'count');
  checkCount(previousMisses, 'previousMisses');
  let survival = 1;
  for (let i = 1; i <= count && survival > 0; i++) {
    survival *= Math.max(0, 1 - constant * (previousMisses + i));
  }
  return survival;
}

function sumPrdSurvival(constant, start) {
  let survival = prdMissTail(constant, start);
  let sum = survival;
  for (let next = start + 1; survival > 0; next++) {
    const chance = Math.min(1, constant * next);
    survival *= 1 - chance;
    sum += survival;
    // Subsequent survival ratios only decrease. Bound the rest by a geometric tail.
    if (survival <= Number.EPSILON * chance * sum) break;
  }
  return sum;
}

export function prdMeanWait(constant) {
  return sumPrdSurvival(constant, 0);
}

export function prdStationaryMissTail(constant, count) {
  return sumPrdSurvival(constant, count) / prdMeanWait(constant);
}

export function calibratePrd(rate) {
  checkRate(rate, 'rate', false);
  let low = 0;
  let high = rate;
  for (let step = 0; step < 100; step++) {
    const mid = low + (high - low) / 2;
    if (mid === low || mid === high) break;
    if (1 / prdMeanWait(mid) < rate) low = mid;
    else high = mid;
  }
  return high;
}
