import test from 'node:test';
import assert from 'node:assert/strict';
import { validCount, candleCounts, candleLayout, parseInviteHash, inviteUrl, rms, BLOW_SENSITIVITY, createBlowDetector } from '../dist/core.js';

test('only whole candle counts 1–99 are accepted', () => {
  for (const value of ['', ' ', 0, 100, -1, 1.5, 'no', Infinity]) assert.equal(validCount(value), null);
  for (const value of [1, '5', 99]) assert.equal(validCount(value), Number(value));
});
test('ages use tens as large candles, ones as small candles, and unknown age uses nine', () => {
  for (const [age, large, small] of [[null, 3, 6], [9, 0, 9], [10, 1, 0], [20, 2, 0], [49, 4, 9], [99, 9, 9]]) {
    assert.deepEqual(candleCounts(age), {large, small, total: large + small});
    const candles = candleLayout(age);
    assert.equal(candles.length, large + small);
    assert.equal(candles.filter(c => c.size === 'large').length, large);
    assert.equal(candles.filter(c => c.size === 'small').length, small);
    assert.equal(new Set(candles.map(c => `${c.x},${c.y}`)).size, candles.length);
    for (const {x, y, height, flame} of candles) {
      assert.ok(((x - 180) / 98) ** 2 + ((y - 55) / 26) ** 2 < 1, `${age} roots stay on the exposed cream`);
      assert.ok(y - height - flame > -24, `${age} flames stay within the visible cake area`);
    }
  }
  const biggest = candleLayout(99);
  for (let i = 0; i < biggest.length; i++) for (let j = i + 1; j < biggest.length; j++) {
    const a = biggest[i], b = biggest[j];
    const separatedHorizontally = Math.abs(a.x - b.x) >= (a.width + b.width) * .9;
    const separatedVertically = a.y - a.height - 2 <= b.y - b.height - b.flame || b.y - b.height - 2 <= a.y - a.height - a.flame;
    assert.ok(separatedHorizontally || separatedVertically, '99-year candle flames do not overlap');
  }
  assert.ok(biggest.some(c => c.size === 'large' && c.x < 180));
  assert.ok(biggest.some(c => c.size === 'large' && c.x > 180));
  assert.equal(biggest.find(c => c.size === 'large').width, 10);
  assert.equal(biggest.find(c => c.size === 'small').width, 7);
  assert.deepEqual([candleLayout(null), candleLayout(49), candleLayout(99)].map(layout => layout.find(c => c.size === 'large').height), [42, 37, 32]);
  assert.notEqual(candleLayout(49)[0].x, candleLayout(49)[7].x, 'rows are staggered');
});
test('invite fragments preserve special names and reject invalid ages or malformed encoding', () => {
  assert.deepEqual(parseInviteHash(''), {name: '', age: null});
  assert.deepEqual(parseInviteHash('#name=%E3%81%91%E3%81%84%E3%81%93&age=49'), {name: 'けいこ', age: 49});
  assert.deepEqual(parseInviteHash('#name=A%26B%20%3C3'), {name: 'A&B <3', age: null});
  for (const hash of ['#age=0', '#age=100', '#age=1.5', '#age=abc', '#name=%E3%ZZ']) assert.deepEqual(parseInviteHash(hash), {name: '', age: null});
  assert.equal(parseInviteHash(`#name=${encodeURIComponent('あ'.repeat(40))}`).name.length, 30);
  assert.equal(inviteUrl('https://example.com/birthday/index.html', ' A&B ', 49), 'https://example.com/birthday/invite.html#name=A%26B&age=49');
  assert.equal(inviteUrl('https://example.com/birthday/', '', null), 'https://example.com/birthday/invite.html');
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
test('small, normal, and loud calibrated dummy blows have distinct outcomes', () => {
  assert.deepEqual(play(.010, 240), ['some']);
  assert.deepEqual(play(.012, 1000), ['some']);
  assert.deepEqual(play(.18, 180), ['all']);
});
test('loud sustained sound extinguishes all within 180 ms', () => {
  assert.deepEqual(play(.16, 180), ['all']);
});
test('loud sound bypasses the gentle-blow cooldown', () => {
  const detector = createBlowDetector();
  assert.deepEqual(play(.04, 240, detector), ['some']);
  assert.deepEqual(play(.16, 180, detector), ['all']);
});
test('microphone sensitivity is centralized and uses calibrated delta values', () => {
  assert.equal(BLOW_SENSITIVITY.calibrationMs, 800);
  assert.ok(BLOW_SENSITIVITY.gentleDelta < BLOW_SENSITIVITY.meterFullDelta);
  assert.ok(BLOW_SENSITIVITY.strongDelta > BLOW_SENSITIVITY.meterFullDelta);
  assert.deepEqual(play(0, 2000, createBlowDetector(BLOW_SENSITIVITY)), []);
});
test('a long animation gap cannot count as a sustained blow', () => {
  assert.equal(createBlowDetector().update(.2, 10000), null);
});
