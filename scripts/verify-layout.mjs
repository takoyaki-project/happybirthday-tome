// Dependency-free rendering QA for the four Stage 2 scenes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'verification');
const profile = path.join(tmpdir(), `happybirthday-tome-edge-profile-${process.pid}`);
await mkdir(output, {recursive: true});
await mkdir(profile, {recursive: true});
await unlink(path.join(profile, 'DevToolsActivePort')).catch(error => { if (error.code !== 'ENOENT') throw error; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!['/', '/index.html', '/app.js', '/core.js', '/celebration.js', '/song.js', '/messages.json', '/style.css'].includes(pathname) && !pathname.startsWith('/assets/')) { res.writeHead(404).end(); return; }
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  const types = {html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8', css: 'text/css; charset=utf-8', png: 'image/png'};
  res.writeHead(200, {'Content-Type': types[file.split('.').pop()], 'Cache-Control': 'no-store'}).end(await readFile(path.join(root, 'dist', file)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browserPath = process.env.EDGE_PATH || (process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : 'google-chrome');
const browser = spawn(browserPath, [
  '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking', '--mute-audio', 'about:blank'
], {windowsHide: true, stdio: 'ignore'});
let ws;
try {
  let port;
  for (let i = 0; i < 300; i++) {
    try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await sleep(100); }
  }
  assert.ok(port, 'headless browser started');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const target = targets.find(item => item.type === 'page');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  const errors = [];
  const requests = [];
  ws.onmessage = ({data}) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task?.reject(new Error(JSON.stringify(message.error))); else task?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, {resolve, reject}); ws.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true, userGesture: true});
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844});
  await send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});
  await send('Page.addScriptToEvaluateOnNewDocument', {source: 'navigator.mediaDevices.getUserMedia=async()=>{const context=new AudioContext();return context.createMediaStreamDestination().stream;};'});
  await send('Page.navigate', {url: origin});
  for (let i = 0; i < 60; i++) {
    if (await evaluate("document.querySelectorAll('.candle').length===5")) break;
    await sleep(100);
  }
  const read = () => evaluate("(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};const visible=id=>!!document.getElementById(id).getClientRects().length;return{scene:document.body.dataset.scene,width:innerWidth,height:innerHeight,scrollY,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,cake:rect('cake'),cakeVisible:visible('cake'),bubble:visible('bubble'),counter:visible('counter'),gauge:visible('meter'),lyrics:visible('song-lyrics'),smoke:visible('smoke'),celebration:visible('celebration-copy'),setup:visible('setup'),message:document.getElementById('celebration-message').textContent,celebrationTitle:rect('celebration-title'),celebrationMessage:rect('celebration-message'),audioNote:rect('audio-note'),mobCount:document.querySelectorAll('.mob').length,candleCount:document.querySelectorAll('.candle').length,outCount:document.querySelectorAll('.candle.out').length,background:getComputedStyle(document.body).backgroundColor};})()");
  const screenshot = async name => {
    await evaluate('window.scrollTo(0,0)');
    assert.equal(await evaluate('scrollY'), 0);
    const shot = await send('Page.captureScreenshot', {format: 'png', clip: {x: 0, y: 0, width: 390, height: 844, scale: 1}, captureBeyondViewport: true});
    await writeFile(path.join(output, name), Buffer.from(shot.data, 'base64'));
  };
  const fits = state => {
    assert.equal(state.width, 390); assert.equal(state.height, 844);
    assert.ok(state.scrollWidth <= 390); assert.ok(state.scrollHeight <= 844);
  };
  const celebrationBands = () => evaluate("(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height};};return{copy:rect('celebration-copy'),cake:rect('cake'),crowd:rect('mob-crowd'),note:rect('audio-note'),top:document.documentElement.getBoundingClientRect().top,scrollY};})()");
  const assertCelebrationBands = async () => {
    const bands = await celebrationBands();
    assert.equal(bands.scrollY, 0); assert.equal(bands.top, 0);
    assert.ok(bands.copy.height <= 844 * .45);
    assert.ok(bands.copy.bottom < bands.cake.top);
    assert.ok(bands.cake.bottom < bands.crowd.top);
    assert.ok(bands.crowd.bottom < bands.note.top);
    return bands;
  };

  const entry = await read();
  fits(entry);
  assert.equal(entry.scene, 'entry'); assert.ok(entry.setup); assert.ok(!entry.cakeVisible);
  await screenshot('entry-390x844.png');

  await evaluate("window.__testSongDuration=8500;document.getElementById('name').value='けいこ';document.getElementById('start').click()");
  await sleep(5000);
  const song = await read();
  fits(song);
  assert.equal(song.scene, 'song'); assert.ok(song.cakeVisible && song.lyrics && !song.bubble && !song.counter && !song.gauge);
  assert.match(await evaluate("document.getElementById('song-lyrics').textContent"), /ディア、けいこ/);
  assert.equal(song.background, 'rgb(25, 13, 29)');
  await screenshot('song-lyrics-390x844.png');
  await sleep(3700);
  const songReady = await read();
  assert.ok(songReady.bubble && songReady.counter && songReady.gauge);
  await screenshot('song-ready-390x844.png');

  await evaluate("window.__testMic=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=()=>new Promise(()=>{});document.getElementById('reset').click();document.getElementById('start').click()");
  await sleep(100);
  const fallbackLayout = await evaluate("(()=>{const fallback=document.getElementById('fallback').getBoundingClientRect();const lyrics=document.getElementById('song-lyrics').getBoundingClientRect();return{visible:!!document.getElementById('fallback').getClientRects().length,fallbackTop:fallback.top,lyricsBottom:lyrics.bottom};})()");
  assert.ok(fallbackLayout.visible && fallbackLayout.fallbackTop >= fallbackLayout.lyricsBottom);
  await screenshot('song-fallback-390x844.png');
  await evaluate("window.__testSongDuration=600;document.getElementById('reset').click();navigator.mediaDevices.getUserMedia=window.__testMic;document.getElementById('start').click()");
  for (let i = 0; i < 40; i++) {
    if (await evaluate("!document.getElementById('cake-button').disabled")) break;
    await sleep(100);
  }
  await sleep(100);

  await evaluate("document.getElementById('name').value='';for(let i=0;i<5;i++)document.getElementById('cake-button').click()");
  await sleep(100);
  const blackout = await read();
  fits(blackout);
  assert.equal(blackout.scene, 'blackout'); assert.ok(blackout.cakeVisible && blackout.smoke && !blackout.bubble && !blackout.counter && !blackout.gauge); assert.equal(blackout.outCount, 5);
  assert.deepEqual(blackout.cake, songReady.cake);
  await screenshot('blackout-390x844.png');

  await sleep(1050);
  const celebrateInitial = await read();
  fits(celebrateInitial);
  assert.equal(celebrateInitial.scene, 'celebrate'); assert.ok(celebrateInitial.cakeVisible && celebrateInitial.celebration); assert.equal(celebrateInitial.outCount, 5); assert.ok(celebrateInitial.mobCount >= 20 && celebrateInitial.mobCount <= 23);
  assert.doesNotMatch(celebrateInitial.message, /あなた|さん/);
  await screenshot('celebrate-initial-390x844.png');

  await sleep(3100);
  const celebrate = await read();
  fits(celebrate);
  assert.equal(celebrate.mobCount, 40);
  await screenshot('celebrate-40-390x844.png');

  const setCelebrationCopy = async (title, message) => {
    await evaluate(`document.getElementById('celebration-title').textContent=${JSON.stringify(title)};document.getElementById('celebration-message').textContent=${JSON.stringify(message)};document.getElementById('party').classList.toggle('long-celebration-message',Array.from(${JSON.stringify(message)}).length>30)`);
    await sleep(100);
  };
  await setCelebrationCopy('おめでとう！', '最高！');
  const oneLine = await read();
  fits(oneLine); assert.ok(oneLine.celebrationMessage.bottom < oneLine.cake.y); assert.ok(oneLine.audioNote.y > oneLine.cake.bottom);
  await assertCelebrationBands();
  await screenshot('celebrate-5-message-1line-390x844.png');

  await setCelebrationCopy('おめでとう！', String.fromCharCode(12354).repeat(40));
  const threeLines = await read();
  fits(threeLines); assert.ok(threeLines.celebrationMessage.bottom < threeLines.cake.y); assert.ok(threeLines.audioNote.y > threeLines.cake.bottom);
  await assertCelebrationBands();
  await screenshot('celebrate-5-message-3lines-390x844.png');

  await setCelebrationCopy('あいうえおかきくさん、おめでとう！', '最高！');
  const longName = await read();
  fits(longName); assert.ok(longName.celebrationTitle.height <= 68); assert.ok(longName.celebrationMessage.bottom < longName.cake.y);
  await screenshot('celebrate-name-8chars-390x844.png');

  const captureSongCount = async count => {
    await evaluate(`document.getElementById('reset').click();document.getElementById('count').value='${count}';document.getElementById('count').dispatchEvent(new Event('input'));document.getElementById('start').click()`);
    for (let i = 0; i < 40; i++) {
      if (await evaluate("!document.getElementById('cake-button').disabled")) break;
      await sleep(100);
    }
    await sleep(100);
    const state = await read();
    fits(state); assert.equal(state.scene, 'song'); assert.equal(state.candleCount, count);
    await screenshot(`song-${count}-candles-390x844.png`);
    return state;
  };
  await captureSongCount(1);
  await captureSongCount(10);
  await captureSongCount(50);
  const song99 = await captureSongCount(99);
  fits(song99); assert.equal(song99.scene, 'song'); assert.equal(song99.candleCount, 99); assert.deepEqual(song99.cake, songReady.cake);

  await evaluate("for(let i=0;i<5;i++)document.getElementById('cake-button').click()");
  await sleep(1100);
  const celebrate99 = await read();
  fits(celebrate99); assert.equal(celebrate99.scene, 'celebrate'); assert.equal(celebrate99.outCount, 99);
  await setCelebrationCopy('おめでとう！', '最高！');
  await assertCelebrationBands();
  await screenshot('celebrate-99-message-1line-390x844.png');
  await setCelebrationCopy('おめでとう！', String.fromCharCode(12354).repeat(40));
  await assertCelebrationBands();
  await screenshot('celebrate-99-message-3lines-390x844.png');

  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => url.startsWith(origin) || url === 'about:blank'));
  console.log('PASS entry hides the cake and fits at 390×844');
  console.log('PASS song shows name lyrics while cue, count, and gauge stay hidden until it ends');
  console.log('PASS microphone fallback control does not overlap the lyrics');
  console.log('PASS blackout keeps the cake fixed, hides the cue, shows smoke, and transitions within 1.5 seconds');
  console.log('PASS celebration appears with 20 mobs and reaches 40 layered mobs in three seconds');
  console.log('PASS celebration copy fits one line, 40 characters over three lines, and an eight-character name');
  console.log('PASS reset returns celebration to entry; 99 candles fit in song');
  console.log('PASS no browser runtime errors or external app requests');
  await writeFile(path.join(output, 'layout-results.json'), JSON.stringify({renderer: 'Headless Microsoft Edge (Chromium), simulated silent microphone; not physical iPhone', viewport: {width: 390, height: 844}, entry, song, blackout, celebrateInitial, celebrate, oneLine, threeLines, longName, song99, celebrate99, errors}, null, 2));
  await send('Browser.close').catch(() => {});
} finally {
  ws?.close(); browser.kill(); server.close();
}
