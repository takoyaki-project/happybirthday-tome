export function validCount(value) {
  const number = Number(value);
  return String(value).trim() !== '' && Number.isInteger(number) && number >= 1 && number <= 99 ? number : null;
}

export function candleLayout(count) {
  if (validCount(count) === null) throw new RangeError('Candle count must be 1–99');
  const rows = Math.ceil(count / 11);
  const result = [];
  for (let row = 0; row < rows; row++) {
    const columns = Math.floor(count / rows) + (row < count % rows ? 1 : 0);
    const y = rows === 1 ? 198 : 157 + row * 84 / (rows - 1);
    const radius = Math.sqrt(1 - ((y - 199) / 62) ** 2) * 128;
    for (let column = 0; column < columns; column++) {
      const x = columns === 1 ? 180 : 180 - radius + (column + .5) * (2 * radius / columns);
      result.push({ x, y, height: rows <= 2 ? 39 : 23, width: rows <= 2 ? 9 : 6 });
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

// A short sustained signal is required; a single click must not blow out candles.
export function createBlowDetector(noise = 0) {
  const small = Math.max(.018, Math.min(.065, noise * 3));
  const large = Math.max(.10, Math.min(.22, noise * 7));
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
      if (strongMs >= 180) {
        strongMs = gentleMs = 0;
        return 'all';
      }
      if (gentleMs >= 240 && cooldown === 0) {
        gentleMs = 0;
        cooldown = 950;
        return 'some';
      }
      return null;
    }
  };
}
