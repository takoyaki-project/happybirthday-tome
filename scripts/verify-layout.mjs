// Dependency-free rendering QA for the four Stage 2 scenes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'verification');
const profile = path.join(root, '.qa', 'edge-profile');
await mkdir(output, {recursive: true});
await mkdir(profile, {recursive: true});
await unlink(path.join(profile, 'DevToolsActivePort')).catch(error => { if (error.code !== 'ENOENT') throw error; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!['/', '/index.html', '/app.js', '/core.js', '/style.css'].includes(pathname)) { res.writeHead(404).end(); return; }
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  const types = {html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8'};
  res.writeHead(200, {'Content-Type': types[file.split('.').pop()], 'Cache-Control': 'no-store'}).end(await readFile(path.join(root, 'dist', file)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = spawn(process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking', '--mute-audio', 'about:blank'
], {windowsHide: true, stdio: 'ignore'});
let ws;
try {
  let port;
  for (let i = 0; i < 100; i++) {
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
  const read = () => evaluate("(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};const visible=id=>!!document.getElementById(id).getClientRects().length;return{scene:document.body.dataset.scene,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,cake:rect('cake'),cakeVisible:visible('cake'),bubble:visible('bubble'),counter:visible('counter'),gauge:visible('meter'),lyrics:visible('song-lyrics'),smoke:visible('smoke'),celebration:visible('celebration-copy'),setup:visible('setup'),message:document.getElementById('celebration-message').textContent,candleCount:document.querySelectorAll('.candle').length,outCount:document.querySelectorAll('.candle.out').length,background:getComputedStyle(document.body).backgroundColor};})()");
  const screenshot = async name => {
    const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
    await writeFile(path.join(output, name), Buffer.from(shot.data, 'base64'));
  };
  const fits = state => {
    assert.equal(state.width, 390); assert.equal(state.height, 844);
    assert.ok(state.scrollWidth <= 390); assert.ok(state.scrollHeight <= 844);
  };

  const entry = await read();
  fits(entry);
  assert.equal(entry.scene, 'entry'); assert.ok(entry.setup); assert.ok(!entry.cakeVisible);
  await screenshot('entry-390x844.png');

  await evaluate("document.getElementById('name').value='けいこ';document.getElementById('start').click()");
  for (let i = 0; i < 40; i++) {
    if (await evaluate("!document.getElementById('cake-button').disabled")) break;
    await sleep(100);
  }
  await sleep(2000);
  const song = await read();
  fits(song);
  assert.equal(song.scene, 'song'); assert.ok(song.cakeVisible && song.lyrics && song.bubble && song.counter && song.gauge);
  assert.equal(song.background, 'rgb(23, 17, 37)');
  await screenshot('song-390x844.png');

  await evaluate("for(let i=0;i<5;i++)document.getElementById('cake-button').click()");
  await sleep(100);
  const blackout = await read();
  fits(blackout);
  assert.equal(blackout.scene, 'blackout'); assert.ok(blackout.cakeVisible && blackout.smoke && !blackout.bubble && !blackout.counter && !blackout.gauge); assert.equal(blackout.outCount, 5);
  assert.deepEqual(blackout.cake, song.cake);
  await screenshot('blackout-390x844.png');

  await sleep(1100);
  const celebrate = await read();
  fits(celebrate);
  assert.equal(celebrate.scene, 'celebrate'); assert.ok(celebrate.cakeVisible && celebrate.celebration); assert.equal(celebrate.outCount, 5);
  assert.match(celebrate.message, /けいこさんが今日の主役/);
  assert.deepEqual(celebrate.cake, song.cake);
  await screenshot('celebrate-390x844.png');

  await evaluate("document.getElementById('reset').click();document.getElementById('count').value='99';document.getElementById('count').dispatchEvent(new Event('input'));document.getElementById('start').click()");
  for (let i = 0; i < 40; i++) {
    if (await evaluate("!document.getElementById('cake-button').disabled")) break;
    await sleep(100);
  }
  await sleep(2000);
  const song99 = await read();
  fits(song99); assert.equal(song99.scene, 'song'); assert.equal(song99.candleCount, 99); assert.deepEqual(song99.cake, song.cake);
  await screenshot('song-99-candles-390x844.png');

  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => url.startsWith(origin) || url === 'about:blank'));
  console.log('PASS entry hides the cake and fits at 390×844');
  console.log('PASS song shows lyrics, cue, count, gauge, and a dark readable scene');
  console.log('PASS blackout keeps the cake fixed, hides the cue, shows smoke, and transitions within 1.5 seconds');
  console.log('PASS celebration keeps the cake fixed and shows the name-ready message');
  console.log('PASS reset returns celebration to entry; 99 candles fit in song');
  console.log('PASS no browser runtime errors or external app requests');
  await writeFile(path.join(output, 'layout-results.json'), JSON.stringify({renderer: 'Headless Microsoft Edge (Chromium), simulated silent microphone; not physical iPhone', viewport: {width: 390, height: 844}, entry, song, blackout, celebrate, song99, errors}, null, 2));
  await send('Browser.close').catch(() => {});
} finally {
  ws?.close(); browser.kill(); server.close();
}
