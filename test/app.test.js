import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as core from '../dist/core.js';
const code = (await readFile(new URL('../dist/app.js', import.meta.url), 'utf8')).replace(/^\uFEFF?import[^\n]+\n/, '');

class Element {
  constructor() {
    this.children = []; this.events = {}; this.attributes = {}; this.value = ''; this.hidden = false;
    this.style = {setProperty() {}};
    this.classes = new Set();
    this.classList = {add: c => this.classes.add(c), remove: c => this.classes.delete(c), contains: c => this.classes.has(c)};
  }
  addEventListener(name, callback) { this.events[name] = callback; }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  click() { if (!this.disabled) this.events.click?.(); }
}
function harness(getUserMedia, withAudio = true) {
  const els = new Map();
  const get = id => { if (!els.has(id)) els.set(id, new Element()); return els.get(id); };
  const raf = new Map();
  const timers = new Map();
  const contexts = [];
  let id = 0;
  let now = 0;
  let signal = 0;
  let requested = 0;
  const param = () => ({value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}});
  const node = () => ({connect(other) { return other; }, disconnect() {}});
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createOscillator() { return {...node(), frequency: param(), start() {}, stop() {}}; }
    createGain() { return {...node(), gain: param()}; }
    createMediaStreamSource() { return node(); }
    createAnalyser() { return {...node(), getFloatTimeDomainData(samples) { for (let i=0;i<samples.length;i++) samples[i] = i % 2 ? signal : -signal; }}; }
  }
  const document = {
    hidden: false, events: {}, getElementById: get, querySelector: get,
    createElementNS: () => new Element(), createElement: () => new Element(), createTextNode: text => ({textContent: text}),
    addEventListener(name, callback) { this.events[name] = callback; }
  };
  const window = {
    isSecureContext: true, AudioContext: withAudio ? AudioContext : undefined, events: {},
    setTimeout(callback, delay) { timers.set(++id, {callback, delay}); return id; },
    addEventListener(name, callback) { this.events[name] = callback; }
  };
  const context = {
    ...core, document, window, navigator: {mediaDevices: {getUserMedia: (...args) => { requested++; return getUserMedia(...args); }}},
    performance: {now: () => now}, Float32Array,
    setTimeout: window.setTimeout, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: cb => { raf.set(++id, cb); return id; }, cancelAnimationFrame: id => raf.delete(id)
  };
  vm.runInNewContext(code, context);
  return {
    get, document, contexts, timers, requested: () => requested,
    submit() { get('setup').events.submit({preventDefault() {}}); },
    count(n) { get('count').value = String(n); get('count').events.input(); },
    name(text) { get('name').value = text; get('name').events.input(); },
    hide() { document.hidden = true; document.events.visibilitychange(); },
    show() { document.hidden = false; document.events.visibilitychange(); },
    frames(n, volume = 0) {
      signal = volume;
      for (let i=0; i<n; i++) { now += 20; const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach(cb => cb(now)); }
    }
  };
}
function microphone() {
  const track = {stopped: false, stop() { this.stopped = true; }};
  return {track, stream: {getTracks: () => [track], getAudioTracks: () => [track]}};
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('nothing requests audio until start; count 99 renders 99 candle groups', () => {
  const app = harness(() => Promise.reject());
  assert.equal(app.requested(), 0);
  assert.equal(app.contexts.length, 0);
  app.count(99);
  assert.equal(app.get('candles').children.length, 99);
  app.name('<img src=x onerror=alert(1)>');
  assert.equal(app.get('dedication').textContent, '<img src=x onerror=alert(1)>さんへ');
  assert.equal(app.get('dedication').children.length, 0);
});
test('microphone denial falls back to taps, completes all 99, and allows reset', async () => {
  const app = harness(() => Promise.reject(new Error('denied')));
  app.count(99);
  app.submit();
  await flush();
  assert.equal(app.get('tap').hidden, false);
  app.get('tap').click();
  assert.equal(app.get('remaining').textContent, 79);
  for (let i=0; i<4; i++) app.get('cake-button').click();
  assert.equal(app.get('remaining').textContent, 0);
  assert.equal(app.get('candles').children.filter(c => c.classList.contains('out')).length, 99);
  assert.equal(app.contexts[0].state, 'closed');
  app.get('reset').click();
  assert.equal(app.get('remaining').textContent, 99);
  assert.equal(app.get('name').disabled, false);
});
test('missing audio support also allows tap completion', () => {
  const app = harness(() => { throw new Error('must not request'); }, false);
  app.count(1); app.submit(); app.get('tap').click();
  assert.equal(app.get('remaining').textContent, 0);
});
test('invalid counts never start microphone', () => {
  const app = harness(() => Promise.reject());
  app.count(100); app.submit();
  assert.equal(app.requested(), 0);
  assert.equal(app.get('start').disabled, false);
});
test('late permission after choosing fallback is stopped and never activates mic', async () => {
  let grant;
  const mic = microphone();
  const app = harness(() => new Promise(resolve => { grant = resolve; }));
  app.submit();
  app.get('fallback').click();
  grant(mic.stream); await flush();
  assert.equal(mic.track.stopped, true);
  assert.equal(app.get('tap').hidden, false);
});
test('microphone permission timeout falls back without keeping a late stream', async () => {
  let grant;
  const mic = microphone();
  const app = harness(() => new Promise(resolve => { grant = resolve; }));
  app.submit();
  [...app.timers.values()].find(t => t.delay === 15000).callback();
  grant(mic.stream); await flush();
  assert.equal(mic.track.stopped, true);
  assert.equal(app.get('tap').hidden, false);
});
test('hide during permission prompt ignores and stops the late stream', async () => {
  let grant;
  const mic = microphone();
  const app = harness(() => new Promise(resolve => { grant = resolve; }));
  app.submit(); app.hide(); grant(mic.stream); await flush();
  assert.equal(mic.track.stopped, true);
  assert.equal(app.get('resume').hidden, false);
});
test('hide releases microphone; explicit resume keeps remaining candle count', async () => {
  const mics = [microphone(), microphone()]; let index = 0;
  const app = harness(() => Promise.resolve(mics[index++].stream));
  app.submit(); await flush(); app.get('tap').click();
  assert.equal(app.get('remaining').textContent, 4);
  app.hide();
  assert.equal(mics[0].track.stopped, true);
  assert.equal(app.contexts[0].state, 'closed');
  app.show();
  assert.equal(app.requested(), 1);
  app.get('resume').click(); await flush();
  assert.equal(app.requested(), 2);
  assert.equal(app.get('remaining').textContent, 4);
  assert.equal(app.get('tap').hidden, false);
});
test('microphone disconnection switches to taps', async () => {
  const mic = microphone();
  const app = harness(() => Promise.resolve(mic.stream));
  app.submit(); await flush(); mic.track.onended();
  assert.equal(app.get('meter-label').textContent, 'タップであそぶ');
  assert.equal(mic.track.stopped, true);
});
test('calibration ignores start tone, gentle voice removes some, loud voice removes all', async () => {
  const mic = microphone();
  const app = harness(() => Promise.resolve(mic.stream));
  app.count(99); app.submit(); await flush();
  app.frames(30, .2);
  assert.equal(app.get('remaining').textContent, 99);
  app.frames(70, 0);
  app.frames(20, .04);
  assert.equal(app.get('remaining').textContent, 79);
  app.frames(20, .18);
  assert.equal(app.get('remaining').textContent, 0);
  assert.equal(mic.track.stopped, true);
});
test('an interrupted audio context pauses and releases the microphone', async () => {
  const mic = microphone();
  const app = harness(() => Promise.resolve(mic.stream));
  app.submit(); await flush();
  app.contexts[0].state = 'interrupted'; app.contexts[0].onstatechange();
  assert.equal(app.get('resume').hidden, false);
  assert.equal(mic.track.stopped, true);
});
test('app code has no data persistence, network calls, recording or HTML interpolation', async () => {
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|MediaRecorder|innerHTML|outerHTML/);
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
});
