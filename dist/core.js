export const INVITE_NAME_MAX_LENGTH = 30;
const CANDLES_PER_ROW = 6;
const CANDLE_SURFACE = Object.freeze({x: 180, y: 55, rx: 98, ry: 26});
const CANDLE_STEMS = Object.freeze([
  {max: 9, large: {height: 42, width: 13, flame: 20}, small: {height: 29, width: 9, flame: 15}},
  {max: 13, large: {height: 37, width: 12, flame: 18}, small: {height: 26, width: 8, flame: 13}},
  {max: 99, large: {height: 32, width: 10, flame: 16}, small: {height: 22, width: 7, flame: 12}}
]);

export function validCount(value) {
  const number = Number(value);
  return String(value).trim() !== '' && Number.isInteger(number) && number >= 1 && number <= 99 ? number : null;
}

export function candleCounts(age) {
  if (age !== null && validCount(age) === null) throw new RangeError('Age must be 1–99 or null');
  const large = age === null ? 3 : Math.floor(age / 10);
  const small = age === null ? 6 : age % 10;
  return {large, small, total: large + small};
}

export function candleLayout(age) {
  const {large, total} = candleCounts(age);
  const rows = Math.ceil(total / CANDLES_PER_ROW);
  // These dimensions are measured from the exposed cream oval in cake-base-v2.png.
  // Keep every root inside that oval; flames extend upward from it.
  const surface = CANDLE_SURFACE;
  // Fill the back row before the middle row when three rows are needed.
  // A short candle behind a tall one would otherwise put two flames together.
  const rowColumns = row => Math.floor(total / rows) + (row < total % rows ? 1 : 0);
  const distribute = (count, capacity, offset = 0) => Array.from({length: count}, (_, i) => offset + Math.floor((i + .5) * capacity / count));
  const backColumns = rowColumns(0);
  const middleColumns = rows === 3 ? rowColumns(1) : 0;
  const largeIndices = rows === 3 && large <= backColumns + middleColumns
    ? large <= backColumns ? distribute(large, backColumns) : [...distribute(backColumns, backColumns), ...distribute(large - backColumns, middleColumns, backColumns)]
    : distribute(large, total);
  const largePositions = new Set(largeIndices);
  const stems = CANDLE_STEMS.find(tier => total <= tier.max);
  const result = [];
  for (let row = 0; row < rows; row++) {
    const columns = rowColumns(row);
    const y = rows === 1 ? surface.y + 2 : rows === 2 ? 47 + row * 23 : 43 + row * 16;
    const radius = Math.sqrt(1 - ((y - surface.y) / surface.ry) ** 2) * surface.rx;
    for (let column = 0; column < columns; column++) {
      const stagger = rows > 1 ? (row % 2 ? .2 : -.2) : 0;
      const x = columns === 1 ? surface.x : surface.x - radius + (column + .5 + stagger) * (2 * radius / columns);
      const size = largePositions.has(result.length) ? 'large' : 'small';
      result.push({x, y, size, ...stems[size]});
    }
  }
  return result;
}

export function parseInviteHash(hash) {
  const empty = {name: '', age: null};
  if (typeof hash !== 'string' || !hash.startsWith('#')) return empty;
  try {
    const values = new Map();
    for (const pair of hash.slice(1).split('&').filter(Boolean)) {
      const separator = pair.indexOf('=');
      if (separator < 0) return empty;
      const key = decodeURIComponent(pair.slice(0, separator));
      const value = decodeURIComponent(pair.slice(separator + 1));
      if (values.has(key)) return empty;
      values.set(key, value);
    }
    const name = Array.from((values.get('name') || '').trim()).slice(0, INVITE_NAME_MAX_LENGTH).join('');
    const ageValue = values.get('age');
    if (ageValue !== undefined && !/^[1-9]\d*$/.test(ageValue)) return empty;
    const age = ageValue === undefined ? null : validCount(ageValue);
    return ageValue !== undefined && age === null ? empty : {name, age};
  } catch { return empty; }
}

export function inviteUrl(pageUrl, name, age) {
  const page = new URL('./invite.html', pageUrl);
  const parts = [];
  if (name.trim()) parts.push(`name=${encodeURIComponent(Array.from(name.trim()).slice(0, INVITE_NAME_MAX_LENGTH).join(''))}`);
  if (age !== null) {
    const value = validCount(age);
    if (value === null) throw new RangeError('Invite age must be 1–99 or null');
    parts.push(`age=${value}`);
  }
  page.hash = parts.join('&');
  return page.href;
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
