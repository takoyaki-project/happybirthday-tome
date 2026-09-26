export function validCount(value) {
  const number = Number(value);
  return String(value).trim() !== '' && Number.isInteger(number) && number >= 1 && number <= 99 ? number : null;
}

export function candleLayout(count) {
  if (validCount(count) === null) throw new RangeError('Candle count must be 1–99');
  const rows = Math.ceil(count / 11);
  // These dimensions are measured from the exposed cream oval in cake-base-v2.png.
  // Keep every root inside that oval; flames extend upward from it.
  const surface = {x: 180, y: 55, rx: 98, ry: 26};
  const stem = rows === 1 ? {height: 28, width: 8, flame: 14} : rows <= 3 ? {height: 22, width: 6, flame: 11} : rows <= 5 ? {height: 17, width: 5, flame: 9} : {height: 13, width: 3.8, flame: 7};
  const result = [];
  for (let row = 0; row < rows; row++) {
    const columns = Math.floor(count / rows) + (row < count % rows ? 1 : 0);
    const y = rows === 1 ? surface.y + 2 : 39 + row * 29 / (rows - 1);
    const radius = Math.sqrt(1 - ((y - surface.y) / surface.ry) ** 2) * surface.rx;
    for (let column = 0; column < columns; column++) {
      const x = columns === 1 ? surface.x : surface.x - radius + (column + .5) * (2 * radius / columns);
      result.push({x, y, ...stem});
    }
  }
  return result;
}

export function rms(samples) {
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;
  let power = 0;
  for (const sample of samples) power += (sample - mean) ** 2;
  return Math.sqrt(power / samples.length);
}

export const BLOW_SENSITIVITY = Object.freeze({
  calibrationMs: 800,
  meterFullDelta: .012,
  meterSmoothing: .06,
  meterFullThreshold: .92,
  gentleDelta: .010,
  strongDelta: .10,
  gentleHoldMs: 240,
  strongHoldMs: 180,
  gentleCooldownMs: 950
});

// A short sustained signal is required; a single click must not blow out candles.
export function createBlowDetector(config = BLOW_SENSITIVITY) {
  const {gentleDelta: small, strongDelta: large, gentleHoldMs, strongHoldMs, gentleCooldownMs} = config;
  let gentleMs = 0;
  let strongMs = 0;
  let cooldown = 0;
  return {
    small, large,
    update(level, elapsed) {
      const dt = Math.max(0, Math.min(elapsed, 60));
      cooldown = Math.max(0, cooldown - dt);
      strongMs = level >= large ? strongMs + dt : 0;
      gentleMs = level >= small ? gentleMs + dt : 0;
      if (strongMs >= strongHoldMs) {
        strongMs = gentleMs = 0;
        return 'all';
      }
      if (gentleMs >= gentleHoldMs && cooldown === 0) {
        gentleMs = 0;
        cooldown = gentleCooldownMs;
        return 'some';
      }
      return null;
    }
  };
}
