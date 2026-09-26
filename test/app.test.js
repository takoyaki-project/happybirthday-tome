import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as core from '../dist/core.js';
import * as celebration from '../dist/celebration.js';
import { SONG } from '../dist/song.js';
const messageData = JSON.parse(await readFile(new URL('../dist/messages.json', import.meta.url), 'utf8'));
const code = (await readFile(new URL('../dist/app.js', import.meta.url), 'utf8')).replace(/^\uFEFF?import[^\n]+\n|^import[^\n]+\n/gm, '');

class Element {
  constructor() {
    this.children = []; this.events = {}; this.attributes = {}; this.dataset = {}; this.value = ''; this.hidden = false;
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
function harness(getUserMedia, withAudio = true, songDuration = 0) {
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
    hidden: false, events: {}, body: new Element(), getElementById: get, querySelector: get,
    createElementNS: () => new Element(), createElement: () => new Element(), createTextNode: text => ({textContent: text}),
    addEventListener(name, callback) { this.events[name] = callback; }
  };
  const window = {
    isSecureContext: true, __testSongDuration: songDuration, AudioContext: withAudio ? AudioContext : undefined, events: {},
    setTimeout(callback, delay) { timers.set(++id, {callback, delay}); return id; },
    addEventListener(name, callback) { this.events[name] = callback; }
  };
  const context = {
    ...core, ...celebration, SONG, messageData, document, window, navigator: {mediaDevices: {getUserMedia: (...args) => { requested++; return getUserMedia(...args); }}},
    performance: {now: () => now}, Float32Array,
    setTimeout: window.setTimeout, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: cb => { raf.set(++id, cb); return id; }, cancelAnimationFrame: id => raf.delete(id)
  };
  vm.runInNewContext(code, context);
  return {
    get, document, contexts, timers, requested: () => requested,
    submit() { get('setup').events.submit({preventDefault() {}}); },
    count(n) { get('count').value = String(n); get('count').events.input(); },
    name(text) { get('name').value = text; get('name').events.input?.(); },
    hide() { document.hidden = true; document.events.visibilitychange(); },
    show() { document.hidden = false; document.events.visibilitychange(); },
    runTimer(delay) { [...timers.values()].find(timer => timer.delay === delay)?.callback(); },
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
  assert.equal(app.get('dedication').textContent, '今日の主役へ');
  assert.equal(app.get('dedication').children.length, 0);
});
test('microphone denial falls back to taps, completes all 99, and allows reset', async () => {
  const app = harness(() => Promise.reject(new Error('denied')));
  app.count(99);
  app.submit();
  await flush();
  assert.equal(app.get('cake-button').disabled, false);
  app.get('cake-button').click();
  assert.equal(app.get('remaining').textContent, 79);
  for (let i=0; i<4; i++) app.get('cake-button').click();
  assert.equal(app.get('remaining').textContent, 0);
  assert.equal(app.get('candles').children.filter(c => c.classList.contains('out')).length, 99);
  assert.equal(app.contexts[0].state, 'running');
  app.get('reset').click();
  assert.equal(app.contexts[0].state, 'closed');
  assert.equal(app.get('remaining').textContent, 99);
  assert.equal(app.get('name').disabled, false);
});
test('missing audio support also allows tap completion', () => {
  const app = harness(() => { throw new Error('must not request'); }, false);
  app.count(1); app.submit(); app.get('cake-button').click();
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
  assert.equal(app.get('cake-button').disabled, false);
});
test('microphone permission timeout falls back without keeping a late stream', async () => {
  let grant;
  const mic = microphone();
  const app = harness(() => new Promise(resolve => { grant = resolve; }));
  app.submit();
  [...app.timers.values()].find(t => t.delay === 15000).callback();
  grant(mic.stream); await flush();
  assert.equal(mic.track.stopped, true);
  assert.equal(app.get('cake-button').disabled, false);
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
  app.submit(); await flush(); app.get('cake-button').click();
  assert.equal(app.get('remaining').textContent, 4);
  app.hide();
  assert.equal(mics[0].track.stopped, true);
  assert.equal(app.contexts[0].state, 'closed');
  app.show();
  assert.equal(app.requested(), 1);
  app.get('resume').click(); await flush();
  assert.equal(app.requested(), 2);
  assert.equal(app.get('remaining').textContent, 4);
  assert.equal(app.get('cake-button').disabled, false);
});
test('microphone disconnection switches to taps', async () => {
  const mic = microphone();
  const app = harness(() => Promise.resolve(mic.stream));
  app.submit(); await flush(); mic.track.onended();
  assert.match(app.get('status').textContent, /マイクはオフ/);
  assert.equal(mic.track.stopped, true);
});
test('calibration subtracts room noise; normal voice fills the meter in about one second, gentle voice removes some, and loud voice removes all', async () => {
  const mic = microphone();
  const app = harness(() => Promise.resolve(mic.stream));
  app.count(99); app.submit(); await flush();
  app.frames(30, .2);
  assert.equal(app.get('remaining').textContent, 99);
  app.frames(70, 0);
  assert.equal(app.get('meter').attributes['aria-valuenow'], 0);
  app.frames(50, core.BLOW_SENSITIVITY.meterFullDelta);
  assert.equal(app.get('meter').attributes['aria-valuenow'], 100);
  assert.equal(app.get('debug-value').textContent, core.BLOW_SENSITIVITY.meterFullDelta.toFixed(3));
  assert.equal(app.get('remaining').textContent, 79);
  app.get('debug-toggle').click();
  assert.equal(app.get('debug-value').hidden, true);
  assert.equal(app.get('debug-toggle').attributes['aria-pressed'], 'false');
  app.get('debug-toggle').click();
  assert.equal(app.get('debug-value').hidden, false);
  assert.ok(parseFloat(app.get('meter-fill').style.width) > 0);
  app.frames(20, .18);
  assert.equal(app.get('remaining').textContent, 0);
  assert.equal(mic.track.stopped, true);
  assert.equal(app.get('meter').attributes['aria-valuenow'], 0);
  assert.equal(app.get('meter-fill').style.width, '0%');
});
test('an interrupted audio context pauses and releases the microphone', async () => {
  const mic = microphone();
  const app = harness(() => Promise.resolve(mic.stream));
  app.submit(); await flush();
  app.contexts[0].state = 'interrupted'; app.contexts[0].onstatechange();
  assert.equal(app.get('resume').hidden, false);
  assert.equal(mic.track.stopped, true);
});
test('app code keeps data local and only reads its bundled messages.json file', async () => {
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|XMLHttpRequest|WebSocket|sendBeacon|MediaRecorder|innerHTML|outerHTML/);
  assert.match(code, /window\.fetch\('\.\/messages\.json'\)/);
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /connect-src 'self'/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
});


test('before start: setup visible, started card and shared blow cue hidden', () => {
  const app = harness(() => Promise.reject());
  assert.equal(app.get('setup').hidden, false);
  assert.equal(app.get('started').hidden, true);
  assert.equal(app.get('start').textContent, 'お祝いをはじめる');
  assert.equal(app.get('blow-cue').hidden, true);
  assert.equal(app.get('volume-area').hidden, true);
});
test('start immediately replaces only card content while microphone permission is pending', () => {
  const app = harness(() => new Promise(() => {}));
  app.name('テスト'); app.count(99); app.submit();
  assert.equal(app.get('setup').hidden, true);
  assert.equal(app.get('started').hidden, false);
  assert.equal(app.get('name').disabled, true);
  assert.equal(app.get('count').disabled, true);
  assert.equal(app.get('start').disabled, true);
  assert.equal(app.get('dedication').textContent, '今日の主役へ');
  assert.equal(app.get('cake-heading').textContent, '願いごと、決まった？');
  assert.equal(app.get('blow-cue').hidden, true);
  assert.equal(app.get('volume-area').hidden, true);
});
test('song keeps microphone cues and detection off until the song ends', async () => {
  const mic = microphone();
  const app = harness(() => Promise.resolve(mic.stream), true, 8500);
  app.name('けいこ'); app.submit(); await flush();
  assert.equal(app.get('song-recipient').textContent, 'けいこさんへ');
  assert.equal(app.get('song-lyrics').hidden, false);
  assert.equal(app.get('blow-cue').hidden, true);
  assert.equal(app.get('volume-area').hidden, true);
  app.frames(20, .5);
  assert.equal(app.get('remaining').textContent, 5);
  app.runTimer(8500);
  assert.equal(app.get('blow-cue').hidden, false);
  assert.equal(app.get('volume-area').hidden, false);
});
test('allowed and denied microphones preserve the exact started card copy', async () => {
  for (const grant of [true, false]) {
    const mic = microphone();
    const app = harness(() => grant ? Promise.resolve(mic.stream) : Promise.reject());
    app.submit(); await flush(); app.frames(110);
    assert.equal(app.get('setup').hidden, true);
    assert.equal(app.get('started').hidden, false);
    assert.equal(app.get('dedication').textContent, '今日の主役へ');
    assert.equal(app.get('cake-heading').textContent, '願いごと、決まった？');
    assert.equal(app.get('blow-cue').hidden, false);
  }
});
test('pause hides both cue children; resume shows both; completion hides both', async () => {
  const app = harness(() => Promise.reject());
  app.count(1); app.submit(); await flush();
  assert.equal(app.get('blow-cue').hidden, false);
  app.hide(); assert.equal(app.get('blow-cue').hidden, true);
  app.show(); app.get('resume').click();
  assert.equal(app.get('blow-cue').hidden, false);
  app.get('cake-button').click();
  assert.equal(app.get('blow-cue').hidden, true);
  assert.equal(app.get('volume-area').hidden, true);
  assert.equal(app.get('cake-heading').textContent, 'ぜんぶ消えた。おめでとう！');
  assert.match(app.get('message-slot').textContent, /今日の主役/);
  assert.equal(app.document.body.dataset.scene, 'blackout');
  app.runTimer(1000);
  assert.equal(app.document.body.dataset.scene, 'celebrate');
  app.get('reset').click();
  assert.equal(app.get('setup').hidden, false);
  assert.equal(app.get('started').hidden, true);
  assert.equal(app.get('blow-cue').hidden, true);
  assert.equal(app.get('start').textContent, 'お祝いをはじめる');
});
test('stage 2 uses one scene state for entry, song, blackout, celebration, and entry again', async () => {
  const app = harness(() => Promise.reject());
  assert.equal(app.document.body.dataset.scene, 'entry');
  app.count(1); app.submit(); await flush();
  assert.equal(app.document.body.dataset.scene, 'song');
  app.get('cake-button').click();
  assert.equal(app.document.body.dataset.scene, 'blackout');
  app.runTimer(1000);
  assert.equal(app.document.body.dataset.scene, 'celebrate');
  app.get('reset').click();
  assert.equal(app.document.body.dataset.scene, 'entry');
});
test('celebration starts with 20 layered mobs, reaches 40 in three seconds, and shows at most three shouts', async () => {
  const app = harness(() => Promise.reject());
  app.count(1); app.submit(); await flush(); app.get('cake-button').click(); app.runTimer(1000);
  assert.equal(app.get('mob-crowd').children.length, 20);
  assert.equal(app.get('mob-crowd').children.filter(mob => mob.classList.contains('is-speaking')).length, 3);
  for (let i = 0; i < 20; i++) app.runTimer(150);
  assert.equal(app.get('mob-crowd').children.length, 40);
  assert.equal(app.get('mob-crowd').children.filter(mob => mob.classList.contains('is-speaking')).length, 3);
});
test('celebration uses local plush character assets instead of emoji mobs', async () => {
  const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  assert.match(source, /MOB_ASSETS/);
  assert.doesNotMatch(source, /🥳|👏|🎉/);
  for (const asset of ['mob-purple-bear-v2.png', 'mob-gold-bunny-v2.png', 'mob-coral-pup-v2.png']) {
    const image = await readFile(new URL(`../dist/assets/${asset}`, import.meta.url));
    assert.ok(image.length > 10_000);
  }
});

test('cake base is a local candle-free asset and candles remain dynamic SVG', async () => {
  const [html, cake] = await Promise.all([
    readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../dist/assets/cake-base-v2.png', import.meta.url))
  ]);
  assert.match(html, /assets\/cake-base-v2\.png/);
  assert.match(html, /id="candles"/);
  assert.ok(cake.length > 10_000);
});
test('celebration uses a visual pop with synthesized applause and cheers, without browser speech', async () => {
  const app = harness(() => Promise.reject());
  app.count(1); app.submit(); await flush(); app.get('cake-button').click(); app.runTimer(1000);
  assert.ok(app.get('celebration-message').classList.contains('celebration-pop'));
  const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(source, /playCrowdCheer\(\);/);
  assert.match(source, /voice\.frequency\.exponentialRampToValueAtTime/);
  assert.doesNotMatch(source, /speechSynthesis|SpeechSynthesisUtterance|speech-enabled|speech-control|speakCelebration/);
  assert.doesNotMatch(html, /speech-enabled|speech-control|読み上げ/);
});
test('completion message uses the entered name, replaces the wish copy, and caps at 40 characters', async () => {
  for (const name of ['けいこ', 'あ'.repeat(16), 'あ'.repeat(18)]) {
    const app = harness(() => Promise.reject());
    app.name(name); app.count(1); app.submit(); await flush();
    app.get('cake-button').click();
    const message = app.get('message-slot').textContent;
    assert.ok(message.length <= 40);
    assert.doesNotMatch(message, /願いごと/);
    if (name === 'けいこ') assert.match(message, /けいこさん/);
  }
});
test('reference copy is editable HTML, the candle count stays required, and bubble and count have one parent', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  for (const text of ['HAPPY BIRTHDAY', 'きょうは、', 'あなたが主役。', '今日の主役のお名前', 'ニックネームでもOK', 'ろうそくは何本にする？', '1〜99本', 'お祝いをはじめる', '今日の主役へ', '願いごと、決まった？']) assert.ok(html.replace(/<[^>]+>/g, '').includes(text));
  assert.doesNotMatch(html, /年齢|0〜120|パーティスタート|YOUR BIRTHDAY CAKE/);
  assert.match(html, /id="count"[^>]*min="1"[^>]*max="99"[^>]*required/);
  assert.match(html, /id="song-recipient"/);
  assert.match(html, /id="blow-cue"[^]*id="bubble"[^]*id="counter"[^]*id="remaining"/);
  assert.equal((code.match(/ui\['blow-cue'\]\.hidden =/g) || []).length, 1);
  assert.doesNotMatch(code, /ui\.(bubble|counter)\.hidden/);
  assert.match(html, /id="volume-area"[^>]*hidden/);
  assert.match(html, /aria-label="音の確認"/);
  assert.match(html, /aria-label="もう一度、火をつける"/);
  const css = await readFile(new URL('../dist/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.icon-button \{[^}]*width: 44px;[^}]*height: 44px;/);
  assert.match(css, /--space-1: 8px;[\s\S]*--space-2: 16px;[\s\S]*--space-3: 24px;[\s\S]*--space-4: 40px;/);
  assert.match(css, /--font-large:[^;]+;[\s\S]*--font-medium:[^;]+;[\s\S]*--font-small:[^;]+;/);
  assert.match(css, /--color-background:[^;]+;[\s\S]*--color-text:[^;]+;[\s\S]*--color-accent:[^;]+;[\s\S]*--color-emphasis:[^;]+;/);
});
