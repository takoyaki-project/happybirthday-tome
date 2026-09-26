import { validCount, candleLayout, rms, createBlowDetector } from './core.js';

import { BLOW_SENSITIVITY } from './core.js';
import { SONG } from './song.js';
const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['party', 'setup', 'started', 'name', 'count', 'start', 'resume', 'fallback', 'reset', 'status', 'sound-test', 'debug-toggle', 'debug-value', 'remaining', 'dedication', 'cake-heading', 'cake-title', 'cake-button', 'candles', 'bubble', 'blow-cue', 'volume-area', 'meter', 'meter-fill', 'message-slot', 'song-recipient', 'song-lyrics', 'blackout-copy', 'celebration-copy', 'celebration-title', 'celebration-message', 'audio-note', 'mob-crowd', 'smoke'].map(id => [id, $(id)]));
const svgNS = 'http://www.w3.org/2000/svg';
let phase = 'idle';
let scene = 'entry';
let total = 5;
let remaining = 5;
let candles = [];
let audio = null;
let stream = null;
let analyser = null;
let source = null;
let frame = 0;
let generation = 0;
let timer = 0;
let songTimers = [];
let ignoreUntil = 0;
let tapOnly = false;
let showDebugValue = true;
let recentMessageIds = [];
let currentCelebrationMessage = '';
let mobTimer = 0;
let mobCount = 0;
let messageData = null;
const WISH_MESSAGE = '願いごとをひとつ。あとは、思いっきりふーっ。';
const CELEBRATION_TEMPLATE = '{name}さんが今日の主役！大きな拍手を送りましょう。';
const MAX_MESSAGE_LENGTH = 40;
const RECENT_MESSAGE_LIMIT = 5;
const MAX_MOBS = 40;
const INITIAL_MOBS = 20;
const MOB_ASSETS = ['./assets/mob-purple-bear-v2.png', './assets/mob-gold-bunny-v2.png', './assets/mob-coral-pup-v2.png'];

// JSON module imports are not supported by every iPhone Safari version.
// This reads only our own bundled data file and never sends user data.
async function loadMessageData() {
  if (!window.fetch) return;
  try {
    const response = await window.fetch('./messages.json');
    if (!response.ok) throw new Error('messages unavailable');
    const data = await response.json();
    if (!Array.isArray(data.messages) || !Array.isArray(data.mobShouts)) throw new Error('messages invalid');
    messageData = data;
  } catch { /* The candle game remains usable if static copy cannot be read. */ }
}
void loadMessageData();

function withoutName(template) {
  return template.replaceAll('{name}さん', '').replaceAll('{name}', '').replace(/^[、。！!\s]+/, '').trim();
}
function chooseCelebrationMessage(messages, name, recentIds = []) {
  const displayName = name.trim();
  const safe = messages.map((template, id) => ({id, template})).filter(({template}) => !/\d+歳/.test(template));
  const nameSafe = displayName ? safe : safe.filter(({template}) => !template.includes('{name}'));
  const options = nameSafe.filter(({id}) => !recentIds.includes(id));
  const selected = (options.length ? options : nameSafe)[Math.floor(Math.random() * (options.length || nameSafe.length))];
  const text = displayName ? selected.template.replaceAll('{name}', displayName) : withoutName(selected.template);
  return {id: selected.id, text: Array.from(text).slice(0, MAX_MESSAGE_LENGTH).join(''), recentIds: [...recentIds, selected.id].slice(-RECENT_MESSAGE_LIMIT)};
}
function keepLatestMobs(mobs, additions) { return [...mobs, ...additions].slice(-MAX_MOBS); }

function status(message, visible = false) {
  ui.status.textContent = message;
  ui.status.classList[visible ? 'add' : 'remove']('notice');
}
function meter(level, measuredLevel = 0) {
  const percent = Math.round(Math.max(0, Math.min(1, level)) * 100);
  ui['meter-fill'].style.width = percent + '%';
  ui.meter.setAttribute('aria-valuenow', percent);
  ui.bubble.style.setProperty('--energy', Math.min(1, level));
  ui['debug-value'].textContent = measuredLevel.toFixed(3);
}
// The bubble and remaining count always share this single visibility boundary.
// When singing is added, change the readiness condition here after song completion.
function updateBlowCue() {
  ui['blow-cue'].hidden = !(scene === 'song' && phase === 'active');
}
function updateGauge() {
  const waiting = scene === 'song' && phase === 'active';
  ui['volume-area'].hidden = !waiting;
  ui['debug-toggle'].hidden = !waiting;
  ui['debug-value'].hidden = !waiting || !showDebugValue;
  ui['debug-toggle'].setAttribute('aria-pressed', String(showDebugValue));
  ui['debug-toggle'].setAttribute('aria-label', showDebugValue ? '現在の音量の数値を隠す' : '現在の音量の数値を表示する');
}
function completionMessage(name, template = CELEBRATION_TEMPLATE) {
  const displayName = name.trim();
  return Array.from(displayName ? template.replaceAll('{name}', displayName) : withoutName(template)).slice(0, MAX_MESSAGE_LENGTH).join('');
}
function controls() {
  const entry = scene === 'entry';
  const locked = !entry;
  document.body.dataset.scene = scene;
  ui.party.dataset.scene = scene;
  ui.party.dataset.micState = phase;
  ui.party.classList[scene === 'celebrate' && Array.from(currentCelebrationMessage).length > 30 ? 'add' : 'remove']('long-celebration-message');
  ui.start.textContent = 'お祝いをはじめる';
  ui.dedication.textContent = '今日の主役へ';
  const complete = ['blackout', 'celebrate'].includes(scene);
  ui['cake-heading'].textContent = complete ? 'ぜんぶ消えた。おめでとう！' : '願いごと、決まった？';
  ui['message-slot'].textContent = complete ? completionMessage(ui.name.value) : WISH_MESSAGE;
  ui['celebration-message'].textContent = complete ? (currentCelebrationMessage || completionMessage(ui.name.value)) : '';
  ui['celebration-title'].textContent = scene === 'celebrate' ? (ui.name.value.trim() ? `${ui.name.value.trim()}さん、おめでとう！` : 'おめでとう！') : 'おめでとう！';
  ui.setup.hidden = !entry;
  ui.started.hidden = entry;
  ui.name.disabled = ui.count.disabled = ui.start.disabled = locked;
  ui.resume.hidden = phase !== 'paused';
  ui.fallback.hidden = scene !== 'song' || phase !== 'preparing';
  ui.reset.hidden = entry;
  ui['cake-button'].disabled = scene !== 'song' || phase !== 'active';
  ui['sound-test'].hidden = scene !== 'song' || !['active', 'complete'].includes(phase);
  ui['song-lyrics'].hidden = scene !== 'song';
  ui['song-recipient'].hidden = scene !== 'song';
  ui['song-recipient'].textContent = ui.name.value.trim() ? `${ui.name.value.trim()}さんへ` : 'あなたへ';
  ui['blackout-copy'].hidden = scene !== 'blackout';
  ui['celebration-copy'].hidden = scene !== 'celebrate';
  ui['audio-note'].hidden = scene !== 'celebrate';
  ui['mob-crowd'].hidden = scene !== 'celebrate';
  ui.smoke.hidden = scene !== 'blackout';
  updateBlowCue();
  updateGauge();
}
function element(tag, attrs, parent) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent.append(node);
  return node;
}
function renderCake() {
  ui.candles.replaceChildren();
  candles = candleLayout(total).map(({x, y, height, width, flame: flameHeight}, i) => {
    const group = element('g', {class: 'candle', transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})`}, ui.candles);
    element('ellipse', {cx: 0, cy: 1.5, rx: width * .8, ry: 2.6, fill: 'rgba(47,19,35,.46)'}, group);
    element('rect', {x: -width / 2, y: -height, width, height, rx: width / 2, fill: i % 2 ? 'url(#candle-purple)' : 'url(#candle-pink)'}, group);
    const stripeOffset = Math.max(3, height * .3);
    const stripeGap = Math.max(4, height * .38);
    element('path', {d: `M${-width/2} ${-height+stripeOffset}l${width} ${-Math.max(2, height*.13)}m${-width} ${stripeGap}l${width} ${-Math.max(2, height*.13)}`, stroke: 'rgba(255,244,213,.88)', 'stroke-width': Math.max(.9, width / 5), 'stroke-linecap': 'round'}, group);
    element('path', {class: 'wick', d: `M0 ${-height}v-5`, stroke: '#4a2548', 'stroke-width': 1.5, 'stroke-linecap': 'round'}, group);
    const flame = element('g', {class: 'flame'}, group);
    const flameWidth = Math.max(3.2, width * .9);
    element('path', {d: `M0 ${-height-flameHeight}C${-flameWidth} ${-height-flameHeight*.48} ${-flameWidth*.78} ${-height-2} 0 ${-height-2}C${flameWidth*.88} ${-height-2} ${flameWidth*.88} ${-height-flameHeight*.54} 0 ${-height-flameHeight}`, fill: 'url(#candle-flame)'}, flame);
    element('ellipse', {cx: 0, cy: -height-flameHeight*.42, rx: Math.max(.9, flameWidth*.22), ry: Math.max(1.8, flameHeight*.2), fill: '#fffbe6'}, flame);
    return group;
  });
  remaining = total;
  updateCount();
}
function updateCount() {
  ui.remaining.textContent = remaining;
  ui['cake-title'].textContent = `${total}本のろうそく。火がついているのは${remaining}本。`;
  ui['cake-button'].setAttribute('aria-label', `ケーキをタップして消す。あと${remaining}本`);
}

function releaseMic() {
  cancelAnimationFrame(frame);
  frame = 0;
  if (stream) {
    for (const track of stream.getTracks()) {
      track.onended = track.onmute = null;
      track.stop();
    }
  }
  stream = null;
  source?.disconnect();
  source = analyser = null;
  meter(0);
}
function releaseAudio() {
  releaseMic();
  const old = audio;
  audio = null;
  if (old) {
    old.onstatechange = null;
    void old.close().catch(() => {});
  }
}
function stopPending() { generation++; clearTimeout(timer); timer = 0; songTimers.forEach(clearTimeout); songTimers = []; }

// Always called synchronously inside a tap/click handler, before requesting the mic.
function prepareSound() {
  try {
    if (!audio || audio.state === 'closed') {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return null;
      audio = new Audio();
    }
    const ctx = audio;
    void ctx.resume().catch(() => {});
    for (const [i, hz] of [659.25, 880].entries()) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const when = ctx.currentTime + .03 + i * .18;
      oscillator.type = 'sine';
      oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(.1, when + .015);
      gain.gain.exponentialRampToValueAtTime(.001, when + .26);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(when);
      oscillator.stop(when + .28);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    ignoreUntil = performance.now() + 1000;
    ctx.onstatechange = () => {
      if (audio === ctx && ['active', 'singing'].includes(phase) && ['interrupted', 'suspended'].includes(ctx.state)) pause();
    };
    return ctx;
  } catch { return null; }
}
function playSong(ctx, ticket) {
  const displayName = ui.name.value.trim() || 'わたし';
  for (const [offset, hz, duration] of SONG.notes) {
    const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); const at = ctx.currentTime + offset / 1000;
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(hz, at);
    gain.gain.setValueAtTime(.001, at); gain.gain.exponentialRampToValueAtTime(.11, at + .02); gain.gain.exponentialRampToValueAtTime(.001, at + duration / 1000);
    oscillator.connect(gain).connect(ctx.destination); oscillator.start(at); oscillator.stop(at + duration / 1000 + .03);
  }
  SONG.lyrics.forEach(([offset, lyric]) => songTimers.push(window.setTimeout(() => { if (phase === 'singing') ui['song-lyrics'].textContent = lyric.replace('{name}', displayName); }, offset)));
  const finish = () => {
    if (ticket !== generation || phase !== 'singing') return;
    if (tapOnly) { activateTap(); return; }
    phase = 'active';
    controls();
    status('ふーっ、いけるよ！');
    listen(ctx, ticket);
  };
  const duration = window.__testSongDuration ?? SONG.durationMs;
  if (duration === 0) finish(); else timer = window.setTimeout(finish, duration);
}
function beginSong(ctx, ticket, useTap = false) {
  if (ticket !== generation) return;
  phase = 'singing';
  tapOnly = useTap;
  status('歌が終わるまで、みんなで歌ってね。');
  controls();
  playSong(ctx, ticket);
}
function activateTap() {
  stopPending();
  releaseMic();
  tapOnly = true;
  phase = 'active';
  controls();
  status('マイクはオフです。ケーキをタップして消せます。', true);
}
function pause() {
  if (!['active', 'preparing', 'singing'].includes(phase)) return;
  stopPending();
  phase = 'paused';
  releaseAudio();
  controls();
  status('一時停止中。タップして再開してください。');
}
function clearMobs() {
  clearTimeout(mobTimer);
  mobTimer = 0;
  mobCount = 0;
  ui['mob-crowd'].replaceChildren();
}
function addMob() {
  const index = mobCount++;
  const depth = index % 3;
  const lane = [
    {scale: .72, bottom: 58, positions: [5, 31, 62, 87, 18, 48, 76]},
    {scale: .9, bottom: 30, positions: [16, 54, 90, 7, 39, 71, 27]},
    {scale: 1.14, bottom: 3, positions: [43, 11, 78, 29, 94, 58, 68]}
  ][depth];
  const mob = document.createElement('div');
  mob.className = 'mob';
  const slot = Math.floor(index / 3);
  mob.style.setProperty('--mob-x', `${lane.positions[slot % lane.positions.length] + (Math.random() * 10 - 5)}%`);
  mob.style.setProperty('--mob-bottom', `${lane.bottom + [0, 9, 3, 12, 5, 1, 8][slot % 7]}%`);
  mob.style.setProperty('--shout-x', `${[22, 78, 36, 68, 50][index % 5]}%`);
  mob.style.setProperty('--mob-scale', lane.scale);
  mob.style.setProperty('--mob-delay', `${index < INITIAL_MOBS ? (index % 10) * 20 : 0}ms`);
  mob.style.setProperty('--mob-layer', String(depth + 1));
  const face = document.createElement('img');
  face.className = 'mob-face';
  face.src = MOB_ASSETS[index % MOB_ASSETS.length];
  face.alt = '';
  face.setAttribute('aria-hidden', 'true');
  const shout = document.createElement('span');
  shout.className = 'mob-shout';
  const shouts = messageData?.mobShouts?.length ? messageData.mobShouts : ['おめでとー！'];
  shout.textContent = shouts[Math.floor(Math.random() * shouts.length)];
  mob.append(face, shout);
  const next = keepLatestMobs([...ui['mob-crowd'].children], [mob]);
  ui['mob-crowd'].replaceChildren(...next);
  updateMobShouts();
}
function updateMobShouts() {
  const mobs = [...ui['mob-crowd'].children];
  mobs.forEach(mob => mob.classList.remove('is-speaking'));
  const slots = mobs.length >= MAX_MOBS ? [3, 20, 37] : [2, 9, 16];
  slots.forEach(index => mobs[index]?.classList.add('is-speaking'));
}
function startMobs() {
  clearMobs();
  for (let i = 0; i < INITIAL_MOBS; i++) addMob();
  const addLater = () => {
    if (scene !== 'celebrate' || ui['mob-crowd'].children.length >= 40) return;
    addMob();
    mobTimer = window.setTimeout(addLater, 150);
  };
  mobTimer = window.setTimeout(addLater, 150);
}
function playCrowdCheer() {
  if (!audio || audio.state !== 'running') return;
  try {
    for (let i = 0; i < 11; i++) {
      const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * .075), audio.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let sample = 0; sample < samples.length; sample++) samples[sample] = (Math.random() * 2 - 1) * (1 - sample / samples.length);
      const noise = audio.createBufferSource();
      const gain = audio.createGain();
      const at = audio.currentTime + .04 + i * .095;
      noise.buffer = buffer;
      gain.gain.setValueAtTime(.001, at);
      gain.gain.exponentialRampToValueAtTime(.045, at + .008);
      gain.gain.exponentialRampToValueAtTime(.001, at + .075);
      noise.connect(gain).connect(audio.destination); noise.start(at); noise.stop(at + .08);
    }
    // A few rising voices over the handclaps make the arrival feel like a cheer.
    for (let i = 0; i < 3; i++) {
      const voice = audio.createOscillator();
      const voiceGain = audio.createGain();
      const at = audio.currentTime + .06 + i * .11;
      voice.type = 'triangle';
      voice.frequency.setValueAtTime(420 + i * 90, at);
      voice.frequency.exponentialRampToValueAtTime(760 + i * 80, at + .42);
      voiceGain.gain.setValueAtTime(.001, at);
      voiceGain.gain.exponentialRampToValueAtTime(.028, at + .05);
      voiceGain.gain.exponentialRampToValueAtTime(.001, at + .5);
      voice.connect(voiceGain).connect(audio.destination); voice.start(at); voice.stop(at + .52);
    }
  } catch { /* Celebration stays visual when audio is unavailable. */ }
}
function beginCelebration() {
  const selected = messageData
    ? chooseCelebrationMessage(messageData.messages, ui.name.value, recentMessageIds)
    : {text: completionMessage(ui.name.value), recentIds: recentMessageIds};
  recentMessageIds = selected.recentIds;
  currentCelebrationMessage = selected.text;
  scene = 'celebrate';
  status('すべてのろうそくが消えました。');
  controls();
  ui['celebration-message'].classList.remove('celebration-pop');
  void ui['celebration-message'].offsetWidth;
  ui['celebration-message'].classList.add('celebration-pop');
  startMobs();
  playCrowdCheer();
}
function extinguish(all = false) {
  if (phase !== 'active') return;
  const amount = all ? remaining : Math.min(remaining, Math.max(1, Math.ceil(total / 5)));
  // Clear in an even spread, so a gentle blow visibly affects several cake rows.
  const lit = candles.filter(candle => !candle.classList.contains('out'));
  for (let i = 0; i < amount; i++) lit[Math.floor(i * lit.length / amount)].classList.add('out');
  remaining -= amount;
  updateCount();
  if (remaining) {
    status(`いい感じ！ あと${remaining}本。`);
    return;
  }
  phase = 'complete';
  stopPending();
  releaseMic();
  scene = 'blackout';
  status('しーっ。願いごとの時間。');
  controls();
  timer = window.setTimeout(() => {
    if (scene !== 'blackout') return;
    beginCelebration();
  }, 1000);
}
function listen(ctx, ticket) {
  const samples = new Float32Array(analyser.fftSize);
  const noiseSamples = [];
  let detector = null;
  let previous = performance.now();
  let level = 0;
  let baseline = 0;
  // Wait for the confirmation tone to finish, then measure the room for 800 ms.
  const calibrateFrom = Math.max(ignoreUntil, performance.now() + 100);
  const readyAt = calibrateFrom + BLOW_SENSITIVITY.calibrationMs;
  function tick(now) {
    if (ticket !== generation || phase !== 'active' || !analyser || audio !== ctx) return;
    const elapsed = now - previous;
    previous = now;
    if (ctx.state !== 'running') { pause(); return; }
    analyser.getFloatTimeDomainData(samples);
    const raw = rms(samples);
    if (now >= calibrateFrom && now < readyAt) noiseSamples.push(raw);
    if (now >= readyAt && !detector) {
      noiseSamples.sort((a, b) => a - b);
      baseline = noiseSamples[Math.floor(noiseSamples.length / 2)] || 0;
      detector = createBlowDetector(BLOW_SENSITIVITY);
      status('準備OK！ 小さな声で少しずつ、大きな声で一気に。');
    }
    const delta = detector ? Math.max(0, raw - baseline) : 0;
    level += (delta - level) * BLOW_SENSITIVITY.meterSmoothing;
    const normalized = level / BLOW_SENSITIVITY.meterFullDelta;
    meter(normalized >= BLOW_SENSITIVITY.meterFullThreshold ? 1 : normalized, delta);
    if (detector && now >= ignoreUntil) {
      const action = detector.update(delta, elapsed);
      if (action) extinguish(action === 'all');
    }
    if (phase === 'active') frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
}
function start(resuming = false) {
  if ((!resuming && phase !== 'idle') || (resuming && phase !== 'paused')) return;
  if (!resuming) {
    const count = validCount(ui.count.value);
    if (count === null) { status('ろうそくは1〜99の整数で入力してね。', true); return; }
    total = count;
    renderCake();
    tapOnly = false;
    scene = 'song';
  }
  stopPending();
  const ticket = generation;
  phase = 'preparing';
  controls();
  const ctx = prepareSound();
  document.activeElement?.blur();
  if (resuming && tapOnly) { activateTap(); return; }
  if (!ctx) {
    activateTap(); return;
  }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { beginSong(ctx, ticket, true); return; }
  status('マイクの許可を確認しています。');
  timer = window.setTimeout(() => {
    if (ticket === generation && phase === 'preparing') beginSong(ctx, ticket, true);
  }, 15000);
  let request;
  try {
    request = navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}, video: false});
  } catch { beginSong(ctx, ticket, true); return; }
  void request.then(async (incoming) => {
    if (ticket !== generation || phase !== 'preparing' || document.hidden) {
      incoming.getTracks().forEach(track => track.stop());
      return;
    }
    clearTimeout(timer);
    stream = incoming;
    // Permission dialogs can interrupt Safari audio; resume again after approval.
    void ctx.resume().catch(() => {});
    if (ctx.state !== 'running') {
      await Promise.race([ctx.resume().catch(() => {}), new Promise(resolve => setTimeout(resolve, 1500))]);
    }
    if (ticket !== generation || phase !== 'preparing') return;
    if (ctx.state !== 'running') { pause(); return; }
    try {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source = ctx.createMediaStreamSource(incoming);
      source.connect(analyser); // Never connect microphone input to speakers.
      for (const track of incoming.getAudioTracks()) {
        track.onended = () => { if (phase === 'active') activateTap(); else if (phase === 'singing') tapOnly = true; };
        track.onmute = () => { if (phase === 'active') pause(); else if (phase === 'singing') tapOnly = true; };
      }
      beginSong(ctx, ticket);
    } catch { beginSong(ctx, ticket, true); }
  }).catch(() => {
    if (ticket === generation && phase === 'preparing') beginSong(ctx, ticket, true);
  });
}
function reset() {
  scene = 'entry';
  phase = 'idle';
  stopPending();
  clearMobs();
  currentCelebrationMessage = '';
  releaseAudio();
  tapOnly = false;
  renderCake();
  controls();
  status('スタートすると、マイクの許可を確認します。');
}
ui.setup.addEventListener('submit', event => { event.preventDefault(); start(); });
ui.resume.addEventListener('click', () => start(true));
ui.fallback.addEventListener('click', () => activateTap());
ui['cake-button'].addEventListener('click', () => extinguish());
ui.reset.addEventListener('click', reset);
ui.count.addEventListener('input', () => {
  const count = validCount(ui.count.value);
  if (phase === 'idle' && count !== null) { total = count; renderCake(); }
});
ui['sound-test'].addEventListener('click', () => {
  if (!prepareSound()) status('音を準備できませんでした。ケーキをタップして遊べます。', true);
  else status('音が出ないときは、マナーモード・消音設定と音量を確認してください。', true);
});
ui['debug-toggle'].addEventListener('click', () => {
  showDebugValue = !showDebugValue;
  updateGauge();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); releaseAudio(); }
});
window.addEventListener('pagehide', () => { pause(); releaseAudio(); });
// Do not restore personal inputs from history or any browser storage.
ui.name.value = '';
ui.count.value = '5';
renderCake();
controls();
