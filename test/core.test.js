import test from 'node:test';
import assert from 'node:assert/strict';
import { validCount, candleLayout, rms, createBlowDetector } from '../dist/core.js';

test('only whole candle counts 1–99 are accepted', () => {
  for (const value of ['', ' ', 0, 100, -1, 1.5, 'no', Infinity]) assert.equal(validCount(value), null);
  for (const value of [1, '5', 99]) assert.equal(validCount(value), Number(value));
});
test('every count has exactly that many distinct candles inside the cake', () => {
  for (let count = 1; count <= 99; count++) {
    const candles = candleLayout(count);
    assert.equal(candles.length, count);
    assert.equal(new Set(candles.map(c => `${c.x},${c.y}`)).size, count);
    for (const {x, y, height} of candles) {
      assert.ok(((x-180)/148)**2 + ((y-199)/62)**2 < 1);
      assert.ok(y-height-18 > 80);
    }
  }
});
test('RMS ignores DC offset but measures alternating sound', () => {
  assert.equal(rms(new Float32Array([.5, .5, .5, .5])), 0);
  assert.ok(Math.abs(rms(new Float32Array([.05, -.05])) - .05) < .000001);
});
function play(level, duration, detector = createBlowDetector()) {
  return Array.from({length: duration / 20}, () => detector.update(level, 20)).filter(Boolean);
}
test('silence and short claps do not extinguish candles', () => {
  assert.deepEqual(play(.005, 2000), []);
  const detector = createBlowDetector();
  assert.deepEqual(play(.3, 60, detector), []);
  assert.deepEqual(play(0, 300, detector), []);
});
test('gentle sustained sound extinguishes a portion, with cooldown', () => {
  assert.deepEqual(play(.04, 1000), ['some']);
});
test('loud sustained sound extinguishes all within 180 ms', () => {
  assert.deepEqual(play(.16, 180), ['all']);
});
test('loud sound bypasses the gentle-blow cooldown', () => {
  const detector = createBlowDetector();
  assert.deepEqual(play(.04, 240, detector), ['some']);
  assert.deepEqual(play(.16, 180, detector), ['all']);
});
test('room noise calibration rejects steady background sound', () => {
  assert.deepEqual(play(.025, 2000, createBlowDetector(.025)), []);
});
test('a long animation gap cannot count as a sustained blow', () => {
  assert.equal(createBlowDetector().update(.2, 10000), null);
});
