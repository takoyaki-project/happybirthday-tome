import { validCount, candleLayout, rms, createBlowDetector } from './core.js';

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['setup', 'name', 'count', 'start', 'resume', 'fallback', 'tap', 'reset', 'status', 'sound-test', 'remaining', 'dedication', 'cake-heading', 'cake-title', 'cake-button', 'candles', 'bubble', 'stage-caption', 'meter', 'meter-fill', 'meter-label'].map(id => [id, $(id)]));
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

function status(message) { ui.status.textContent = message; }
function meter(level) {
  const percent = Math.round(Math.min(1, level) * 100);
  ui['meter-fill'].style.width = percent + '%';
  ui.meter.setAttribute('aria-valuenow', percent);
  ui.bubble.style.setProperty('--energy', Math.min(1, level));
}
function controls() {
  const locked = phase !== 'idle';
  ui.name.disabled = ui.count.disabled = locked;
  ui.start.hidden = locked && phase !== 'preparing';
  ui.start.disabled = phase === 'preparing';
  ui.start.textContent = phase === 'preparing' ? '準備しています…' : 'パーティーをスタート ✦';
  ui.resume.hidden = phase !== 'paused';
  ui.fallback.hidden = phase !== 'preparing';
  ui.tap.hidden = phase !== 'active';
  ui.reset.hidden = !['active', 'complete', 'paused'].includes(phase);
  ui['cake-button'].disabled = phase !== 'active';
  ui['sound-test'].hidden = !['active', 'complete'].includes(phase);
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
function updateName() {
  const name = ui.name.value.trim();
  ui.dedication.textContent = name ? `${name}さんへ` : '今日の主役へ';
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
function activateTap(message) {
  stopPending();
  releaseMic();
  tapOnly = true;
  phase = 'active';
  controls();
  ui['meter-label'].textContent = 'タップであそぶ';
  ui['stage-caption'].textContent = 'ケーキか「タップで消す」を押してね。';
  status(message);
}
function pause() {
  if (!['active', 'preparing'].includes(phase)) return;
  stopPending();
  phase = 'paused';
  releaseAudio();
  controls();
  ui['stage-caption'].textContent = '願いごとは、そのままに。';
  status('一時停止しました。タップして再開すると、音とマイクを準備し直します。');
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
  document.querySelector('.stage').classList.add('complete');
  ui['cake-heading'].textContent = 'ぜんぶ消えた。おめでとう！';
  ui.bubble.textContent = 'やったー！';
  ui['stage-caption'].textContent = 'その願いごと、かないますように。';
  ui['meter-label'].textContent = 'ろうそく、ぜんぶ消えました';
  status('大成功！ お誕生日おめでとう。');
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
      ui['stage-caption'].textContent = '願いごとをして、ふーっとどうぞ。';
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
    if (count === null) { status('ろうそくは1〜99の整数で入力してね。'); return; }
    total = count;
    renderCake();
    updateName();
    tapOnly = false;
  }
  stopPending();
  const ticket = generation;
  phase = 'preparing';
  controls();
  const ctx = prepareSound();
  if (resuming && tapOnly) { activateTap('タップで再開しました。'); return; }
  if (!ctx || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    activateTap('マイクを使えない環境です。タップで遊べます。'); return;
  }
  status('マイクの許可を選んでね。音が聞こえない場合はマナーモードと音量を確認してください。');
  timer = window.setTimeout(() => {
    if (ticket === generation && phase === 'preparing') activateTap('マイクの準備が終わらないため、タップで遊べるようにしました。');
  }, 15000);
  let request;
  try {
    request = navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}, video: false});
  } catch { activateTap('マイクを使えませんでした。タップで遊べます。'); return; }
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
        track.onended = () => { if (phase === 'active') activateTap('マイクが切断されました。タップで続きを遊べます。'); };
        track.onmute = () => { if (phase === 'active') pause(); };
      }
      phase = 'active';
      tapOnly = false;
      ui['meter-label'].textContent = '声のボリューム';
      status('周りの音を確認中。少しだけ静かに待ってね。');
      controls();
      listen(ctx, ticket);
    } catch { activateTap('マイクを準備できませんでした。タップで遊べます。'); }
  }).catch(() => {
    if (ticket === generation && phase === 'preparing') activateTap('マイクはオフです。ケーキか「タップで消す」を押してね。');
  });
}
function reset() {
  phase = 'idle';
  stopPending();
  releaseAudio();
  tapOnly = false;
  document.querySelector('.stage').classList.remove('complete');
  ui.bubble.replaceChildren(document.createTextNode('ふーっ'));
  const mark = document.createElement('span');
  mark.textContent = '！';
  ui.bubble.append(mark);
  ui['cake-heading'].textContent = '願いごと、決まった？';
  ui['stage-caption'].textContent = 'ろうそくも、気持ちも、準備万端。';
  ui['meter-label'].textContent = '声のボリューム';
  renderCake();
  controls();
  status('スタートすると、マイクの許可を確認します。');
}
ui.setup.addEventListener('submit', event => { event.preventDefault(); start(); });
ui.resume.addEventListener('click', () => start(true));
ui.fallback.addEventListener('click', () => activateTap('マイクなしで始めました。タップで消してね。'));
ui.tap.addEventListener('click', () => extinguish());
ui['cake-button'].addEventListener('click', () => extinguish());
ui.reset.addEventListener('click', reset);
ui.name.addEventListener('input', updateName);
ui.count.addEventListener('input', () => {
  const count = validCount(ui.count.value);
  if (phase === 'idle' && count !== null) { total = count; renderCake(); }
});
ui['sound-test'].addEventListener('click', () => {
  if (!prepareSound()) status('音を準備できませんでした。音がなくてもタップで遊べます。');
  else status('確認音を鳴らしました。聞こえない場合はマナーモード・消音設定と音量を確認してください。');
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
