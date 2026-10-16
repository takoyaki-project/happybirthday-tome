import { INVITE_NAME_MAX_LENGTH, validCount, candleCounts, candleLayout, parseInviteHash, inviteUrl, rms, createBlowDetector } from './core.js';

import { BLOW_SENSITIVITY } from './core.js';
import { SONG, PLUSH_SONG } from './song.js';
const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['party', 'setup', 'started', 'name', 'count', 'age-error', 'mode-phone', 'mode-plush', 'mode-description', 'start', 'invite-create', 'invite-result', 'invite-link', 'invite-share', 'invite-copy', 'invite-try', 'invite-feedback', 'invite-card', 'invite-recipient', 'invite-open', 'resume', 'fallback', 'reset', 'status', 'sound-test', 'debug-toggle', 'debug-value', 'remaining', 'dedication', 'cake-heading', 'cake-title', 'cake-button', 'candles', 'bubble', 'bubble-word', 'blow-cue', 'volume-area', 'meter', 'meter-fill', 'message-slot', 'song-recipient', 'recipient-name', 'recipient-suffix', 'song-lyrics', 'tap-mic-note', 'plush-prepare', 'plush-pop', 'plush-again', 'plush-confetti', 'blackout-copy', 'celebration-copy', 'celebration-title', 'celebration-message', 'audio-note', 'mob-crowd', 'smoke'].map(id => [id, $(id)]));
const svgNS = 'http://www.w3.org/2000/svg';
let phase = 'idle';
let scene = 'entry';
let total = 9;
let chosenAge = null;
let remaining = 9;
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
let micDenied = false;
let micNoteTimer = 0;
let showDebugValue = true;
let recentMessageIds = [];
let currentCelebrationMessage = '';
let mobTimer = 0;
let mobCount = 0;
let messageData = null;
const isInvitePage = window.location?.pathname?.endsWith('/invite.html') ?? false;
let playMode = isInvitePage ? 'invite' : 'phone';
const WISH_MESSAGE = '願いごとをひとつ。あとは、思いっきりふーっ。';
const TAP_WISH_MESSAGE = '願いごとをひとつ。あとは、ケーキをタップ！';
const TAP_READY_MESSAGE = 'ケーキをタップして、ろうそくを消してね。';
const INVITE_CELEBRATION_MESSAGE = 'お誕生日、おめでとうございます！';
const CELEBRATION_TEMPLATE = '{name}さんが今日の主役！大きな拍手を送りましょう。';
const MAX_MESSAGE_LENGTH = 40;
const SONG_NOTE_PEAK_GAIN = .35;
const AGE_ERROR_MESSAGE = '年齢は1〜99の整数で入力してね。';
const MODE_DESCRIPTIONS = {
  phone: 'スマホに向かって、ふーっと息を吹いて、ろうそくを消します。',
  plush: 'micro:bitを仕込んだ、手作りのぬいぐるみケーキと遊ぶモードです。持っていない場合は『スマホだけ』を選んでください。'
};
const RECENT_MESSAGE_LIMIT = 5;
const MAX_GENTLE_BLOWS = 3;
const SONG_NOTE_MS = 4000;
const MIC_PERMISSION_ERROR_NAMES = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'];
const MAX_MOBS = 40;
const PLUSH_SONG_START_OFFSET_MS = 100;
const PLUSH_MICROBIT_READY_DELAY_MS = 1000;
// The observed micro:bit heart/sound arrives around 18 s after the pop; allow 1 s of margin.
const PLUSH_CELEBRATION_DELAY_MS = 19000;
const BLACKOUT_DURATION_MS = 1000;
// A sharp, broadband pop with a short thump; avoid sustained tones that sound like a buzzer.
const PLUSH_CRACKER_GAIN = .92;
const PLUSH_CRACKER_DURATION_MS = 420;
const PLUSH_CRACKER_ATTACK_MS = 2;
const PLUSH_CRACKER_MAIN_DECAY_MS = 130;
const PLUSH_CRACKER_TAIL_DECAY_MS = 240;
const PLUSH_CRACKER_THUMP_MS = 65;
const PLUSH_CRACKER_THUMP_START_HZ = 520;
const PLUSH_CRACKER_THUMP_END_HZ = 240;
const PLUSH_CRACKER_DRIVE = 2.2;
const PLUSH_CONFETTI_COUNT = 22;
const MOB_START_DELAY_MS = 500;
const MOB_SOLO_INTERVAL_MS = 280;
const MOB_WAVE_INTERVAL_MS = 560;
const MOB_WAVE_STAGGER_MS = 24;
const MOB_ARRIVAL_MS = 600;
const MOB_SOLO_SLOTS = [2, 3, 6];
const MOB_SPEAKING_SLOTS = [6, 11, 12];
const MOB_ASSETS = ['./assets/mob-purple-bear-v2.png', './assets/mob-gold-bunny-v2.png', './assets/mob-coral-pup-v2.png', './assets/mob-chick-v2.png', './assets/mob-mint-bunny-v2.png'];
const MOB_SLOTS = [
  {x: 3, bottom: 360, size: 58, layer: 1, asset: 3, enterX: -110, enterY: 0}, {x: 97, bottom: 355, size: 66, layer: 1, asset: 0, enterX: 110, enterY: 0},
  {x: 27, bottom: 210, size: 126, layer: 4, asset: 1, enterX: -80, enterY: 110}, {x: 73, bottom: 214, size: 132, layer: 4, asset: 2, enterX: 80, enterY: 110},
  {x: 11, bottom: 270, size: 85, layer: 2, asset: 4, enterX: -105, enterY: 0}, {x: 89, bottom: 263, size: 88, layer: 2, asset: 3, enterX: 105, enterY: 0},
  {x: 50, bottom: 154, size: 105, layer: 3, asset: 0, enterX: 0, enterY: 125}, {x: 4, bottom: 155, size: 92, layer: 3, asset: 2, enterX: -100, enterY: 100},
  {x: 96, bottom: 148, size: 96, layer: 3, asset: 1, enterX: 100, enterY: 100}, {x: 43, bottom: 300, size: 62, layer: 1, asset: 3, enterX: -30, enterY: 90},
  {x: 57, bottom: 295, size: 68, layer: 1, asset: 4, enterX: 30, enterY: 90}, {x: 17, bottom: 92, size: 116, layer: 4, asset: 3, enterX: -90, enterY: 125},
  {x: 83, bottom: 88, size: 120, layer: 4, asset: 4, enterX: 90, enterY: 125}, {x: 36, bottom: 120, size: 88, layer: 3, asset: 2, enterX: -45, enterY: 120},
  {x: 64, bottom: 118, size: 92, layer: 3, asset: 0, enterX: 45, enterY: 120}, {x: 1, bottom: 315, size: 64, layer: 1, asset: 1, enterX: -110, enterY: 0},
  {x: 99, bottom: 310, size: 66, layer: 1, asset: 2, enterX: 110, enterY: 0}, {x: 22, bottom: 325, size: 56, layer: 1, asset: 4, enterX: -75, enterY: 80},
  {x: 78, bottom: 320, size: 56, layer: 1, asset: 3, enterX: 75, enterY: 80}, {x: 50, bottom: 65, size: 138, layer: 4, asset: 1, enterX: 0, enterY: 140},
  {x: 9, bottom: 222, size: 76, layer: 2, asset: 0, enterX: -105, enterY: 70}, {x: 91, bottom: 218, size: 76, layer: 2, asset: 4, enterX: 105, enterY: 70},
  {x: 32, bottom: 248, size: 74, layer: 2, asset: 2, enterX: -55, enterY: 80}, {x: 68, bottom: 246, size: 74, layer: 2, asset: 3, enterX: 55, enterY: 80},
  {x: 42, bottom: 215, size: 104, layer: 3, asset: 4, enterX: -35, enterY: 120}, {x: 58, bottom: 215, size: 104, layer: 3, asset: 3, enterX: 35, enterY: 120},
  {x: 24, bottom: 55, size: 124, layer: 4, asset: 0, enterX: -80, enterY: 130}, {x: 76, bottom: 52, size: 126, layer: 4, asset: 2, enterX: 80, enterY: 130},
  {x: 5, bottom: 105, size: 90, layer: 3, asset: 1, enterX: -110, enterY: 115}, {x: 95, bottom: 103, size: 92, layer: 3, asset: 3, enterX: 110, enterY: 115},
  {x: 48, bottom: 255, size: 64, layer: 2, asset: 0, enterX: 0, enterY: 75}, {x: 52, bottom: 275, size: 60, layer: 1, asset: 4, enterX: 0, enterY: 70},
  {x: 14, bottom: 345, size: 54, layer: 1, asset: 3, enterX: -90, enterY: 0}, {x: 86, bottom: 342, size: 54, layer: 1, asset: 1, enterX: 90, enterY: 0},
  {x: 34, bottom: 42, size: 110, layer: 4, asset: 4, enterX: -55, enterY: 140}, {x: 66, bottom: 40, size: 112, layer: 4, asset: 2, enterX: 55, enterY: 140},
  {x: 39, bottom: 160, size: 78, layer: 3, asset: 3, enterX: -35, enterY: 105}, {x: 61, bottom: 160, size: 78, layer: 3, asset: 0, enterX: 35, enterY: 105},
  {x: 18, bottom: 185, size: 82, layer: 2, asset: 1, enterX: -70, enterY: 95}, {x: 82, bottom: 183, size: 82, layer: 2, asset: 4, enterX: 70, enterY: 95}
];

// JSON module imports are not supported by every iPhone Safari version.
// This reads only our own bundled data file and never sends user data.
async function loadMessageData() {
  if (!window.fetch) return;
  try {
    const response = await window.fetch('./messages.json');
    if (!response.ok) throw new Error('messages unavailable');
    const data = await response.json();
    if (!Array.isArray(data.messages) || !Array.isArray(data.inviteMessages) || !Array.isArray(data.mobShouts)) throw new Error('messages invalid');
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
  ui.status.classList[visible && scene !== 'song' ? 'add' : 'remove']('notice');
  if (visible && scene === 'song') showSongNote(message);
}
function showSongNote(message) {
  clearTimeout(micNoteTimer);
  ui['tap-mic-note'].textContent = message;
  ui['tap-mic-note'].hidden = false;
  micNoteTimer = window.setTimeout(() => { ui['tap-mic-note'].hidden = true; micNoteTimer = 0; }, SONG_NOTE_MS);
}
function modeDescription() {
  if (ui['mode-plush'].checked) { ui['mode-description'].textContent = MODE_DESCRIPTIONS.plush; return; }
  const secondLine = document.createElement('span');
  secondLine.textContent = 'ふーっと息を吹いて、ろうそくを消します。';
  ui['mode-description'].replaceChildren(document.createTextNode('スマホに向かって、'), secondLine);
}
function meter(level, measuredLevel = 0) {
  const percent = Math.round(Math.max(0, Math.min(1, level)) * 100);
  ui['meter-fill'].style.width = percent + '%';
  ui.meter.setAttribute('aria-valuenow', percent);
  ui.bubble.style.setProperty('--energy', Math.min(1, level));
  ui['debug-value'].textContent = measuredLevel.toFixed(3);
}
// The bubble and remaining count always share this single visibility boundary.
function updateBlowCue() {
  ui['blow-cue'].hidden = !(scene === 'song' && phase === 'active' && playMode !== 'plush');
  ui['bubble-word'].textContent = tapOnly ? 'タップ' : 'ふーっ';
}
function updateGauge() {
  const waiting = scene === 'song' && phase === 'active' && playMode === 'phone' && !tapOnly;
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
function fitCelebrationMessage() {
  const el = ui['celebration-message'];
  const windowEl = el?.parentElement;
  if (!windowEl || el.offsetParent === null) return;
  const MAX = 40, MIN = 18, LINE = 1.3;
  const title = ui['celebration-title'];
  title.style.fontSize = '';
  const titleMax = parseFloat(getComputedStyle(title).fontSize);
  const titleLines = title.textContent.includes('\n') ? 2 : 1;
  for (let size = titleMax; size >= 14; size -= 1) {
    title.style.fontSize = `${size}px`;
    if (title.scrollHeight <= Math.ceil(parseFloat(getComputedStyle(title).lineHeight) * titleLines) + 1) break;
  }
  el.style.lineHeight = String(LINE);
  const style = getComputedStyle(windowEl);
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const gap = parseFloat(style.rowGap) || 0;
  const titleHeight = title.scrollHeight;
  const ornamentHeight = parseFloat(getComputedStyle(windowEl.querySelector('.frame-ornament')).height);
  const messageRoom = windowEl.clientHeight - padding - titleHeight - ornamentHeight - gap * 2 - 2;
  for (let size = MAX; size >= MIN; size -= 1) {
    el.style.fontSize = `${size}px`;
    if (el.scrollHeight <= messageRoom) return;
  }
  el.style.fontSize = `${MIN}px`;
}
window.addEventListener('resize', fitCelebrationMessage);
if (document.fonts?.ready) void document.fonts.ready.then(fitCelebrationMessage);
function controls() {
  const entry = scene === 'entry';
  const locked = !entry;
  document.body.dataset.scene = scene;
  ui.party.dataset.scene = scene;
  ui.party.dataset.micState = phase;
  ui.party.dataset.playMode = playMode;
  const messageLength = Array.from(currentCelebrationMessage).length;
  ui.party.classList[scene === 'celebrate' && messageLength > 16 && messageLength <= 28 ? 'add' : 'remove']('medium-celebration-message');
  ui.party.classList[scene === 'celebrate' && messageLength > 28 ? 'add' : 'remove']('long-celebration-message');
  ui.start.textContent = 'お祝いをはじめる';
  modeDescription();
  ui.dedication.textContent = '今日の主役へ';
  const complete = ['blackout', 'celebrate'].includes(scene);
  ui['cake-heading'].textContent = complete ? 'ぜんぶ消えた。おめでとう！' : '願いごと、決まった？';
  ui['message-slot'].textContent = complete ? (playMode === 'invite' ? INVITE_CELEBRATION_MESSAGE : completionMessage(ui.name.value)) : (tapOnly ? TAP_WISH_MESSAGE : WISH_MESSAGE);
  ui['celebration-message'].textContent = complete ? (currentCelebrationMessage || completionMessage(ui.name.value)) : '';
  ui['celebration-title'].textContent = scene === 'celebrate'
    ? (ui.name.value.trim() ? `${ui.name.value.trim()}さん\nおめでとう！` : 'おめでとう！')
    : 'おめでとう！';
  if (scene === 'celebrate') requestAnimationFrame(fitCelebrationMessage);
  ui.setup.hidden = !entry || playMode === 'invite';
  ui['invite-card'].hidden = !entry || playMode !== 'invite';
  ui['invite-recipient'].textContent = ui.name.value.trim() ? `${ui.name.value.trim()}さんへ` : 'あなたへ';
  ui.started.hidden = entry;
  ui.name.disabled = ui.count.disabled = ui['mode-phone'].disabled = ui['mode-plush'].disabled = ui.start.disabled = ui['invite-create'].disabled = locked;
  ui.resume.hidden = phase !== 'paused';
  ui.fallback.hidden = playMode !== 'phone' || scene !== 'song' || phase !== 'preparing';
  ui['plush-prepare'].hidden = scene !== 'plush-prepare';
  ui['plush-pop'].disabled = scene !== 'plush-prepare' || phase !== 'plush-ready';
  ui['plush-again'].hidden = !(playMode === 'plush' && scene === 'song' && ['singing', 'plush-wait'].includes(phase));
  ui.reset.hidden = entry;
  ui['cake-button'].disabled = scene !== 'song' || phase !== 'active' || playMode === 'plush';
  ui['sound-test'].hidden = scene !== 'song' || !['active', 'complete'].includes(phase);
  ui['song-lyrics'].hidden = scene !== 'song';
  if (scene !== 'song' || phase !== 'active') ui['tap-mic-note'].hidden = true;
  if (scene !== 'song') ui['song-recipient'].classList.remove('is-dear');
  if (scene !== 'song' || playMode !== 'plush' || phase !== 'plush-wait') $('plush-blow-note').hidden = true;
  ui['song-recipient'].hidden = scene !== 'song' || (playMode === 'plush' && phase === 'plush-wait');
  const recipient = ui.name.value.trim();
  ui['recipient-name'].textContent = recipient || 'あなた';
  ui['recipient-suffix'].textContent = recipient ? 'さんへ' : 'へ';
  ui['song-recipient'].dataset.nameLength = Array.from(recipient).length <= 6 ? 'short' : Array.from(recipient).length <= 12 ? 'medium' : 'long';
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
  candles = candleLayout(chosenAge).map(({x, y, size, height, width, flame: flameHeight}, i) => {
    const group = element('g', {class: 'candle', transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})`}, ui.candles);
    group.dataset.size = size;
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
  total = candleCounts(chosenAge).total;
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
function stopPending() { generation++; clearTimeout(timer); timer = 0; clearTimeout(micNoteTimer); micNoteTimer = 0; ui['tap-mic-note'].hidden = true; songTimers.forEach(clearTimeout); songTimers = []; }

// Always called synchronously inside a tap/click handler, before requesting the mic.
function prepareSound(playReadyTone = true) {
  try {
    if (!audio || audio.state === 'closed') {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return null;
      audio = new Audio();
    }
    const ctx = audio;
    void ctx.resume().catch(() => {});
    if (playReadyTone) for (const [i, hz] of [659.25, 880].entries()) {
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
    ignoreUntil = performance.now() + (playReadyTone ? 1000 : 0);
    ctx.onstatechange = () => {
      if (audio === ctx && ['active', 'singing'].includes(phase) && ['interrupted', 'suspended'].includes(ctx.state)) pause();
    };
    return ctx;
  } catch { return null; }
}
function renderLyric(lyric, displayName) {
  ui['song-recipient'].classList[lyric.includes('{name}') ? 'add' : 'remove']('is-dear');
  if (!lyric.includes('{name}')) { ui['song-lyrics'].textContent = lyric; return; }
  const [before, after] = lyric.split('{name}');
  const name = document.createElement('span');
  name.className = 'lyric-name';
  name.textContent = displayName;
  ui['song-lyrics'].replaceChildren(document.createTextNode(before), name, document.createTextNode(after));
}
function playSong(ctx, ticket) {
  const displayName = ui.name.value.trim() || (playMode === 'invite' ? 'you' : 'わたし');
  for (const [offset, hz, duration] of SONG.notes) {
    const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); const at = ctx.currentTime + offset / 1000;
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(hz, at);
    gain.gain.setValueAtTime(.001, at); gain.gain.exponentialRampToValueAtTime(SONG_NOTE_PEAK_GAIN, at + .02); gain.gain.exponentialRampToValueAtTime(.001, at + duration / 1000);
    oscillator.connect(gain).connect(ctx.destination); oscillator.start(at); oscillator.stop(at + duration / 1000 + .03);
  }
  SONG.lyrics.forEach(([offset, lyric]) => songTimers.push(window.setTimeout(() => { if (phase === 'singing') renderLyric(lyric, displayName); }, offset)));
  const finish = () => {
    if (ticket !== generation || phase !== 'singing') return;
    if (tapOnly) { activateTap(); return; }
    phase = 'active';
    controls();
    status('ふーっ、いけるよ！');
    listen(ctx, ticket);
  };
  // Completion follows the last scheduled note, never a separate display-only timer.
  const duration = window.__testSongDuration ?? Math.max(...SONG.notes.map(([start, , noteDuration]) => start + noteDuration));
  if (duration === 0) finish(); else timer = window.setTimeout(finish, duration);
}
function beginSong(ctx, ticket, useTap = false) {
  if (ticket !== generation) return;
  phase = 'singing';
  tapOnly = useTap;
  ui['song-recipient'].classList.remove('is-dear');
  status('歌が終わるまで、みんなで歌ってね。');
  controls();
  playSong(ctx, ticket);
}
function burstPlushConfetti() {
  ui['plush-confetti'].replaceChildren();
  for (let i = 0; i < PLUSH_CONFETTI_COUNT; i++) {
    const piece = document.createElement('span');
    const angle = i * 2.399963;
    piece.style.setProperty('--confetti-dx', `${Math.cos(angle) * 130}px`);
    piece.style.setProperty('--confetti-dy', `${80 + (i % 5) * 24}px`);
    piece.style.setProperty('--confetti-turn', `${(i * 47) % 360 - 180}deg`);
    piece.style.setProperty('--confetti-delay', `${(i % 6) * 28}ms`);
    ui['plush-confetti'].append(piece);
  }
}
function playPlushCracker(ctx) {
  if (!ctx?.createBuffer || !ctx.createBufferSource) return false;
  try {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * PLUSH_CRACKER_DURATION_MS / 1000), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    const duration = PLUSH_CRACKER_DURATION_MS / 1000;
    const thumpDuration = PLUSH_CRACKER_THUMP_MS / 1000;
    const softLimit = PLUSH_CRACKER_GAIN / Math.tanh(PLUSH_CRACKER_DRIVE);
    const frequencyDrop = (PLUSH_CRACKER_THUMP_START_HZ - PLUSH_CRACKER_THUMP_END_HZ) / thumpDuration;
    for (let i = 0; i < samples.length; i++) {
      const time = i / ctx.sampleRate;
      const edge = Math.min(1, time * 1000 / PLUSH_CRACKER_ATTACK_MS, (duration - time) * 1000 / PLUSH_CRACKER_THUMP_MS);
      const burst = .78 * Math.exp(-time * 1000 / PLUSH_CRACKER_MAIN_DECAY_MS)
        + .32 * Math.exp(-time * 1000 / PLUSH_CRACKER_TAIL_DECAY_MS);
      const thump = time < thumpDuration
        ? .36 * Math.sin(2 * Math.PI * (PLUSH_CRACKER_THUMP_START_HZ * time - frequencyDrop * time * time / 2)) * (1 - time / thumpDuration)
        : 0;
      const crack = (Math.random() * 2 - 1) * burst + thump;
      samples[i] = softLimit * Math.tanh(PLUSH_CRACKER_DRIVE * crack) * Math.max(0, edge);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => source.disconnect();
    // Schedule in the tap handler. Safari may keep the context suspended until resume resolves.
    source.start(ctx.currentTime + .02);
    return true;
  } catch { return false; }
}
function playPlushSong() {
  if (playMode !== 'plush' || !['plush-ready', 'singing', 'plush-wait'].includes(phase)) return;
  const ctx = prepareSound(false);
  if (!ctx || !playPlushCracker(ctx)) {
    stopPending();
    scene = 'plush-prepare'; phase = 'plush-ready';
    controls();
    status('音を再生できません。音量とブラウザーを確認して、もう一度タップしてください。', true);
    return;
  }
  stopPending();
  const ticket = generation;
  scene = 'song'; phase = 'singing';
  ui['song-lyrics'].textContent = '';
  ui['song-recipient'].classList.remove('is-dear');
  controls(); burstPlushConfetti();
  status('歌が終わったら、ぬいぐるみのケーキの上の micro:bit に息を吹きかけてね。');
  void ctx.resume().catch(() => {
    if (ticket !== generation) return;
    stopPending();
    scene = 'plush-prepare'; phase = 'plush-ready';
    controls();
    status('音を再生できません。もう一度タップしてください。', true);
  });
  const displayName = ui.name.value.trim() || 'あなた';
  PLUSH_SONG.lyrics.forEach(([offset, lyric]) => songTimers.push(window.setTimeout(() => {
    if (ticket === generation && phase === 'singing') renderLyric(lyric, displayName);
  }, PLUSH_SONG_START_OFFSET_MS + offset)));
  timer = window.setTimeout(() => {
    if (ticket !== generation || phase !== 'singing') return;
    phase = 'plush-wait';
    ui['song-lyrics'].textContent = 'もうすぐ\nふーっ！';
    ui['song-recipient'].classList.remove('is-dear');
    controls();
    status('micro:bit が息を待つまで、少し待ってね。');
  }, PLUSH_SONG_START_OFFSET_MS + PLUSH_SONG.durationMs);
  songTimers.push(window.setTimeout(() => {
    if (ticket !== generation || phase !== 'plush-wait') return;
    ui['song-lyrics'].textContent = 'ぬいぐるみのケーキに\nふーっ！';
    $('plush-blow-note').hidden = false;
    status('ケーキの上の micro:bit に息を吹きかけてね。スマホのお祝いは自動で始まります。');
  }, PLUSH_SONG_START_OFFSET_MS + PLUSH_SONG.durationMs + PLUSH_MICROBIT_READY_DELAY_MS));
  songTimers.push(window.setTimeout(() => {
    if (ticket !== generation || phase !== 'plush-wait' || document.hidden) return;
    phase = 'active';
    extinguish(true);
  }, PLUSH_CELEBRATION_DELAY_MS - BLACKOUT_DURATION_MS));
}
function beginPlushPreparation() {
  scene = 'plush-prepare'; phase = 'plush-ready'; tapOnly = false;
  stopPending();
  const ctx = prepareSound(false);
  controls(); document.activeElement?.blur();
  status(ctx ? 'スマホの音量を上げて、クラッカーをタップしてね。' : 'この端末では音を再生できません。音量とブラウザーを確認してください。', !ctx);
}
function activateTap() {
  stopPending();
  releaseMic();
  tapOnly = true;
  phase = 'active';
  controls();
  status(playMode === 'invite' ? TAP_READY_MESSAGE : 'ケーキをタップして、ろうそくを消してね。');
  if (micDenied && playMode === 'phone') showSongNote('マイクはオフです。ケーキをタップして消せます。');
  micDenied = false;
}
function pause() {
  if (!['active', 'preparing', 'singing', 'plush-ready', 'plush-wait'].includes(phase)) return;
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
function addMob(slotIndex, delay = 0) {
  const index = mobCount++;
  const slot = MOB_SLOTS[slotIndex];
  const mob = document.createElement('div');
  mob.className = 'mob';
  mob.dataset.slot = String(slotIndex);
  mob.style.setProperty('--mob-x', `${slot.x}%`);
  mob.style.setProperty('--mob-bottom', `${slot.bottom}px`);
  mob.style.setProperty('--mob-size', `${slot.size}px`);
  mob.style.setProperty('--mob-enter-x', `${slot.enterX}px`);
  mob.style.setProperty('--mob-enter-y', `${slot.enterY}px`);
  mob.style.setProperty('--shout-x', '50%');
  mob.style.setProperty('--mob-scale', String(.94 + (index % 4) * .04));
  mob.style.setProperty('--mob-delay', `${delay}ms`);
  mob.style.setProperty('--mob-duration', `${MOB_ARRIVAL_MS}ms`);
  mob.style.setProperty('--mob-layer', String(slot.layer));
  const face = document.createElement('img');
  face.className = 'mob-face';
  face.src = MOB_ASSETS[slot.asset];
  face.alt = '';
  face.setAttribute('aria-hidden', 'true');
  const shout = document.createElement('span');
  shout.className = 'mob-shout';
  const shouts = messageData?.mobShouts?.length ? messageData.mobShouts : ['おめでとー！'];
  shout.textContent = shouts[Math.floor(Math.random() * shouts.length)];
  mob.append(face, shout);
  ui['mob-crowd'].append(mob);
  while (ui['mob-crowd'].children.length > MAX_MOBS) ui['mob-crowd'].children[0].remove();
  updateMobShouts();
}
function updateMobShouts() {
  const mobs = [...ui['mob-crowd'].children];
  mobs.forEach(mob => mob.classList.remove('is-speaking'));
  mobs.filter(mob => MOB_SPEAKING_SLOTS.includes(Number(mob.dataset.slot)))
    .forEach(mob => mob.classList.add('is-speaking'));
}
function startMobs() {
  clearMobs();
  // Three solo entrances, then four rows from the back toward the audience.
  const rows = [[], [], [], []];
  MOB_SLOTS.forEach((slot, index) => {
    if (MOB_SOLO_SLOTS.includes(index)) return;
    rows[slot.bottom >= 290 ? 0 : slot.bottom >= 200 ? 1 : slot.bottom >= 130 ? 2 : 3].push(index);
  });
  rows.forEach(row => row.sort((a, b) => MOB_SLOTS[a].x - MOB_SLOTS[b].x));
  const groups = [...MOB_SOLO_SLOTS.map(index => [index]), ...rows];
  let group = 0;
  const enterGroup = () => {
    if (scene !== 'celebrate') return;
    const slots = groups[group];
    slots.forEach((slot, index) => addMob(slot, group < 3 ? 0 : index * MOB_WAVE_STAGGER_MS));
    group++;
    if (group < groups.length) mobTimer = window.setTimeout(enterGroup,
      group < 3 ? MOB_SOLO_INTERVAL_MS : MOB_WAVE_INTERVAL_MS);
    else mobTimer = 0;
  };
  enterGroup();
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
  const messages = playMode === 'invite' ? messageData?.inviteMessages : messageData?.messages;
  const selected = messageData
    && messages?.length ? chooseCelebrationMessage(messages, ui.name.value, recentMessageIds)
    : {text: playMode === 'invite' ? INVITE_CELEBRATION_MESSAGE : completionMessage(ui.name.value), recentIds: recentMessageIds};
  recentMessageIds = selected.recentIds;
  currentCelebrationMessage = selected.text;
  scene = 'celebrate';
  status('すべてのろうそくが消えました。');
  controls();
  ui['celebration-message'].classList.remove('celebration-pop');
  void ui['celebration-message'].offsetWidth;
  ui['celebration-message'].classList.add('celebration-pop');
  mobTimer = window.setTimeout(startMobs, MOB_START_DELAY_MS);
  playCrowdCheer();
}
function extinguish(all = false) {
  if (phase !== 'active') return;
  if (playMode === 'plush') all = true;
  const amount = all ? remaining : Math.min(remaining, Math.max(1, Math.ceil(total / MAX_GENTLE_BLOWS)));
  // Spread the change across the cake and across both candle sizes.
  const lit = candles.filter(candle => !candle.classList.contains('out'));
  const spread = (list, count) => Array.from({length: count}, (_, i) => list[Math.floor((i + .5) * list.length / count)]);
  const large = lit.filter(candle => candle.dataset.size === 'large');
  const small = lit.filter(candle => candle.dataset.size === 'small');
  let selected = spread(lit, amount);
  if (amount > 1 && large.length && small.length) {
    const largeAmount = Math.max(1, Math.min(large.length, amount - 1, Math.max(amount - small.length, Math.round(amount * large.length / lit.length))));
    selected = [...spread(large, largeAmount), ...spread(small, amount - largeAmount)];
  }
  selected.forEach(candle => candle.classList.add('out'));
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
  }, BLACKOUT_DURATION_MS);
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
function selectedAge() {
  const raw = ui.count.value.trim();
  if (!raw) return null;
  return /^[1-9]\d*$/.test(raw) ? (validCount(raw) ?? undefined) : undefined;
}
function checkedAge() {
  const age = selectedAge();
  const invalid = age === undefined;
  ui['age-error'].hidden = !invalid;
  ui['age-error'].textContent = invalid ? AGE_ERROR_MESSAGE : '';
  ui.count.setAttribute('aria-invalid', String(invalid));
  return age;
}
function start(resuming = false) {
  if ((!resuming && phase !== 'idle') || (resuming && phase !== 'paused')) return;
  if (playMode === 'invite') {
    if (!resuming) renderCake();
    scene = 'song';
    stopPending();
    const ticket = generation;
    phase = 'preparing';
    tapOnly = true;
    controls();
    const ctx = prepareSound();
    document.activeElement?.blur();
    if (ctx) beginSong(ctx, ticket, true);
    else activateTap();
    return;
  }
  if (resuming && playMode === 'plush') { beginPlushPreparation(); return; }
  if (!resuming) {
    const age = checkedAge();
    if (age === undefined) return;
    chosenAge = age;
    renderCake();
    tapOnly = false;
    micDenied = false;
    playMode = ui['mode-plush'].checked ? 'plush' : 'phone';
    if (playMode === 'plush') { beginPlushPreparation(); return; }
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
  } catch (error) { micDenied = MIC_PERMISSION_ERROR_NAMES.includes(error?.name); beginSong(ctx, ticket, true); return; }
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
  }).catch(error => {
    if (ticket === generation && phase === 'preparing') { micDenied = MIC_PERMISSION_ERROR_NAMES.includes(error?.name); beginSong(ctx, ticket, true); }
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
  micDenied = false;
  if (playMode !== 'invite') {
    playMode = 'phone';
    ui['mode-phone'].checked = true;
    ui['mode-plush'].checked = false;
  }
  renderCake();
  controls();
  status(playMode === 'invite' ? '' : 'スタートすると、マイクの許可を確認します。');
}
ui.setup.addEventListener('submit', event => { event.preventDefault(); start(); });
for (const id of ['mode-phone', 'mode-plush']) ui[id].addEventListener('change', () => {
  modeDescription();
});
ui['invite-create'].addEventListener('click', () => {
  const name = Array.from(ui.name.value.trim()).slice(0, INVITE_NAME_MAX_LENGTH).join('');
  const age = checkedAge();
  if (age === undefined) { ui['invite-result'].hidden = true; return; }
  ui['invite-link'].value = inviteUrl(window.location.href, name, age);
  ui['invite-result'].hidden = false;
  ui['invite-feedback'].textContent = '';
  ui['invite-share'].hidden = typeof navigator.share !== 'function';
  ui['invite-result'].scrollIntoView?.({block: 'nearest'});
});
for (const id of ['name', 'count']) ui[id].addEventListener('input', () => {
  ui['invite-result'].hidden = true;
  ui['age-error'].hidden = true;
  ui.count.setAttribute('aria-invalid', 'false');
});
ui['invite-share'].addEventListener('click', () => {
  const name = ui.name.value.trim();
  const text = `${name ? `${name}さん、` : ''}お誕生日おめでとうございます。お祝いを届けます。`;
  void navigator.share({text, url: ui['invite-link'].value}).catch(() => {});
});
ui['invite-copy'].addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(ui['invite-link'].value);
    ui['invite-feedback'].textContent = 'コピーしました';
  } catch { ui['invite-feedback'].textContent = 'コピーできませんでした。リンクを選択してコピーしてね。'; }
});
ui['invite-try'].addEventListener('click', () => { window.location.href = ui['invite-link'].value; });
ui['invite-open'].addEventListener('click', () => start());
ui.resume.addEventListener('click', () => start(true));
ui.fallback.addEventListener('click', () => activateTap());
ui['plush-pop'].addEventListener('click', playPlushSong);
ui['plush-again'].addEventListener('click', playPlushSong);
ui['cake-button'].addEventListener('click', () => extinguish());
ui.reset.addEventListener('click', reset);
ui.count.addEventListener('input', () => {
  const age = selectedAge();
  if (phase === 'idle' && age !== undefined && playMode !== 'invite') { chosenAge = age; renderCake(); }
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
ui.count.value = '';
if (isInvitePage) {
  const invitation = parseInviteHash(window.location.hash);
  ui.name.value = invitation.name;
  chosenAge = invitation.age;
  tapOnly = true;
}
renderCake();
controls();
