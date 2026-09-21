import { validCount, candleLayout, rms, createBlowDetector } from './core.js';

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['setup', 'started', 'name', 'count', 'start', 'resume', 'fallback', 'reset', 'status', 'sound-test', 'remaining', 'dedication', 'cake-heading', 'cake-title', 'cake-button', 'candles', 'bubble', 'blow-cue'].map(id => [id, $(id)]));
const svgNS = 'http://www.w3.org/2000/svg';
let phase = 'idle';
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
let ignoreUntil = 0;
let tapOnly = false;

function status(message, visible = false) {
  ui.status.textContent = message;
  ui.status.classList[visible ? 'add' : 'remove']('notice');
}
function meter(level) {
  ui.bubble.style.setProperty('--energy', Math.min(1, level));
}
// The bubble and remaining count always share this single visibility boundary.
// When singing is added, change the readiness condition here after song completion.
function updateBlowCue() {
  ui['blow-cue'].hidden = !['preparing', 'active'].includes(phase);
}
function controls() {
  const locked = phase !== 'idle';
  ui.start.textContent = 'パーティスタート';
  ui.dedication.textContent = '今日の主役へ';
  ui['cake-heading'].textContent = phase === 'complete' ? 'ぜんぶ消えた。おめでとう！' : '願いごと、決まった？';
  ui.setup.hidden = locked;
  ui.started.hidden = !locked;
  ui.name.disabled = ui.count.disabled = ui.start.disabled = locked;
  ui.resume.hidden = phase !== 'paused';
  ui.fallback.hidden = phase !== 'preparing';
  ui.reset.hidden = !['active', 'complete', 'paused'].includes(phase);
  ui['cake-button'].disabled = phase !== 'active';
  ui['sound-test'].hidden = !['active', 'complete'].includes(phase);
  updateBlowCue();
}
function element(tag, attrs, parent) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent.append(node);
  return node;
}
function renderCake() {
  ui.candles.replaceChildren();
  candles = candleLayout(total).map(({x, y, height, width}, i) => {
    const group = element('g', {class: 'candle', transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})`}, ui.candles);
    element('ellipse', {cx: 0, cy: 1, rx: width, ry: 2.5, fill: '#ddc6bb'}, group);
    element('rect', {x: -width / 2, y: -height, width, height, rx: 2, fill: ['#fa466b', '#6841bb', '#268886'][i % 3]}, group);
    element('path', {d: `M${-width/2} ${-height+9}l${width} -4m${-width} 15l${width} -4`, stroke: '#fff6de', 'stroke-width': 2}, group);
    element('path', {class: 'wick', d: `M0 ${-height}v-5`, stroke: '#372157', 'stroke-width': 1.5}, group);
    const flame = element('g', {class: 'flame'}, group);
    element('path', {d: `M0 ${-height-18}C-10 ${-height-8} -6 ${-height-2} 0 ${-height-3}C7 ${-height-3} 7 ${-height-10} 0 ${-height-18}`, fill: '#fb8b32'}, flame);
    element('ellipse', {cx: 0, cy: -height-7, rx: 2, ry: 4, fill: '#ffe689'}, flame);
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
function stopPending() { generation++; clearTimeout(timer); timer = 0; }

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
      if (audio === ctx && phase === 'active' && ['interrupted', 'suspended'].includes(ctx.state)) pause();
    };
    return ctx;
  } catch { return null; }
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
  if (!['active', 'preparing'].includes(phase)) return;
  stopPending();
  phase = 'paused';
  releaseAudio();
  controls();
  status('一時停止中。タップして再開してください。');
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
  releaseAudio();
  status('すべてのろうそくが消えました。');
  controls();
}
function listen(ctx, ticket) {
  const samples = new Float32Array(analyser.fftSize);
  const noiseSamples = [];
  let detector = null;
  let previous = performance.now();
  let level = 0;
  // Wait for the confirmation tone to finish, then measure the room for 800 ms.
  const calibrateFrom = Math.max(ignoreUntil, performance.now() + 100);
  const readyAt = calibrateFrom + 800;
  function tick(now) {
    if (ticket !== generation || phase !== 'active' || !analyser || audio !== ctx) return;
    const elapsed = now - previous;
    previous = now;
    if (ctx.state !== 'running') { pause(); return; }
    analyser.getFloatTimeDomainData(samples);
    const raw = rms(samples);
    level += (raw - level) * .3;
    meter(level / .14);
    if (now >= calibrateFrom && now < readyAt) noiseSamples.push(raw);
    if (now >= readyAt && !detector) {
      noiseSamples.sort((a, b) => a - b);
      detector = createBlowDetector(noiseSamples[Math.floor(noiseSamples.length / 2)] || 0);
      status('準備OK！ 小さな声で少しずつ、大きな声で一気に。');
    }
    if (detector && now >= ignoreUntil) {
      const action = detector.update(level, elapsed);
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
  }
  stopPending();
  const ticket = generation;
  phase = 'preparing';
  controls();
  const ctx = prepareSound();
  document.activeElement?.blur();
  if (resuming && tapOnly) { activateTap(); return; }
  if (!ctx || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    activateTap(); return;
  }
  status('マイクの許可を確認しています。');
  timer = window.setTimeout(() => {
    if (ticket === generation && phase === 'preparing') activateTap();
  }, 15000);
  let request;
  try {
    request = navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}, video: false});
  } catch { activateTap(); return; }
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
        track.onended = () => { if (phase === 'active') activateTap(); };
        track.onmute = () => { if (phase === 'active') pause(); };
      }
      phase = 'active';
      tapOnly = false;
      status('周りの音を確認中。少しだけ静かに待ってね。');
      controls();
      listen(ctx, ticket);
    } catch { activateTap(); }
  }).catch(() => {
    if (ticket === generation && phase === 'preparing') activateTap();
  });
}
function reset() {
  phase = 'idle';
  stopPending();
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); releaseAudio(); }
});
window.addEventListener('pagehide', () => { pause(); releaseAudio(); });
// Do not restore personal inputs from history or any browser storage.
ui.name.value = '';
ui.count.value = '5';
renderCake();
controls();
