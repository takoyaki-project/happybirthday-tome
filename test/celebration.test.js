import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAX_MESSAGE_LENGTH, MAX_MOBS, chooseCelebrationMessage, keepLatestMobs } from '../dist/celebration.js';

const data = JSON.parse(await readFile(new URL('../dist/messages.json', import.meta.url), 'utf8'));

test('celebration messages use messages.json, stay within 40 characters, and avoid the latest five', () => {
  const allowed = data.messages.filter(message => !/\d+歳/.test(message));
  assert.ok(allowed.length >= 30);
  let recent = [];
  for (let step = 0; step < 16; step++) {
    const before = recent;
    const result = chooseCelebrationMessage(data.messages, data.readAloudPrefix, 'けいこ', recent, () => 0);
    assert.ok(!before.includes(result.id));
    assert.ok(Array.from(result.text).length <= MAX_MESSAGE_LENGTH);
    recent = result.recentIds;
  }
});

test('mob list keeps only the newest 40 people', () => {
  let mobs = [];
  for (let id = 0; id < 45; id++) mobs = keepLatestMobs(mobs, [id]);
  assert.equal(mobs.length, MAX_MOBS);
  assert.deepEqual(mobs, Array.from({length: MAX_MOBS}, (_, index) => index + 5));
});
