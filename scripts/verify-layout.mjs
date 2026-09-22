// Dependency-free rendering QA using an isolated headless Edge profile and CDP.
// This is a desktop Chromium renderer, not an iPhone/Safari device test.
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!['/', '/index.html', '/app.js', '/core.js', '/style.css'].includes(pathname)) { res.writeHead(404).end(); return; }
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  const types = {html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8'};
  res.writeHead(200, {'Content-Type': types[file.split('.').pop()], 'Cache-Control': 'no-store'}).end(await readFile(path.join(root, 'dist', file)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--mute-audio', 'about:blank'
], {windowsHide: true, stdio: 'ignore'});
let ws;
try {
  let port;
  for (let i=0; i<100; i++) {
    try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await sleep(100); }
  }
  assert.ok(port, 'headless browser started');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(t => t.type === 'page');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject) => {ws.onopen=resolve;ws.onerror=reject;});
  let seq = 0;
  const pending = new Map();
  const errors = [];
  const requests = [];
  ws.onmessage = ({data}) => {
    const msg = JSON.parse(data);
    if (msg.id) {
      const task = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) task?.reject(new Error(JSON.stringify(msg.error))); else task?.resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
    if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url);
  };
  const send = (method, params = {}) => new Promise((resolve,reject) => {
    const id = ++seq; pending.set(id, {resolve,reject}); ws.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true, userGesture: true});
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  // Simulate an allowed silent microphone; never use the developer's real mic.
  await send('Page.addScriptToEvaluateOnNewDocument', {source: `
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      return context.createMediaStreamDestination().stream;
    };
  `});
  await send('Page.navigate', {url: origin});
  for (let i=0;i<60;i++) {
    if (await evaluate(`document.querySelectorAll('.candle').length === 5`)) break;
    await sleep(100);
  }
  await evaluate('document.fonts.ready.then(() => true)');
  const read = () => evaluate(`(() => {
    const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}; };
    const visible = id => !!document.getElementById(id).getClientRects().length;
    return {
      width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
      gauge:rect('meter'),gaugeVisible:visible('meter'),cake:rect('cake'),card:(() => {const r = document.querySelector('.message-card').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})(),
      setup:visible('setup'),started:visible('started'),name:visible('name'),count:visible('count'),start:visible('start'),bubble:visible('bubble'),counter:visible('counter'),
      dedication:document.getElementById('dedication').textContent,heading:document.getElementById('cake-heading').textContent,
      wish:document.getElementById('message-slot').textContent,
      candleCount:document.querySelectorAll('.candle').length,
      visibleText:document.body.innerText
    };
  })()`);
  const screenshot = async name => {
    const shot = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
    await writeFile(path.join(output,name), Buffer.from(shot.data, 'base64'));
  };
  const checkFits = (state, gaugeVisible) => {
    assert.equal(state.width,390); assert.equal(state.height,844);
    assert.ok(state.scrollWidth<=390); assert.ok(state.scrollHeight<=844);
    assert.ok(state.cake.bottom<=844);
    assert.equal(state.gaugeVisible, gaugeVisible);
    if (gaugeVisible) assert.ok(state.gauge.bottom<=844);
  };
  const before = await read();
  checkFits(before, false);
  assert.ok(before.setup && before.name && before.count && before.start);
  assert.ok(!before.started && !before.bubble && !before.counter);
  for (const text of ['本日の主役、入場です。','自分に、おめでとう。','パーティスタート']) assert.ok(before.visibleText.includes(text));
  await screenshot('before-390x844.png');
  await evaluate(`document.getElementById('name').value='けいこ';document.getElementById('start').click()`);
  for(let i=0;i<40;i++) {if(await evaluate(`!document.getElementById('cake-button').disabled`)) break;await sleep(100);}
  await sleep(2000); // allow real calibration animation frames to settle
  const after = await read();
  checkFits(after, true);
  assert.deepEqual(after.cake,before.cake);
  assert.deepEqual(after.card,before.card);
  assert.ok(after.started && !after.setup && !after.name && !after.count && !after.start);
  assert.ok(after.bubble && after.counter);
  assert.equal(after.dedication,'今日の主役へ');
  assert.equal(after.heading,'願いごと、決まった？');
  assert.equal(after.wish,'願いごとをひとつ。あとは、思いっきりふーっ。');
  assert.ok(after.visibleText.includes('声のボリューム'));
  assert.ok(after.visibleText.includes('小さく ー 大きく'));
  for (const text of ['本日の主役、入場です。','自分に、おめでとう。','パーティスタート','YOUR BIRTHDAY CAKE']) assert.ok(!after.visibleText.includes(text));
  assert.ok(!(await evaluate(`document.getElementById('status').classList.contains('notice')`)), 'normal started screenshot has no fallback notice');
  await screenshot('after-390x844.png');
  console.log('PASS 390×844: input and started screens fit without scrolling');
  console.log('PASS card copy switches and name/count/start controls disappear');
  console.log(`PASS cake stays at x=${before.cake.x}, y=${before.cake.y}, width=${before.cake.width}, height=${before.cake.height}`);
  console.log('PASS bubble and remaining count appear together');
  console.log('PASS voice gauge appears only while waiting to blow; cake position is fixed');
  await evaluate(`for(let i=0;i<5;i++) document.getElementById('cake-button').click()`);
  const completedFive = await read();
  checkFits(completedFive, false);
  assert.ok(!completedFive.bubble && !completedFive.counter);
  assert.equal(completedFive.heading, 'ぜんぶ消えた。おめでとう！');
  assert.ok(completedFive.visibleText.includes('けいこさんが今日の主役'));
  assert.ok(!completedFive.visibleText.includes('願いごとをひとつ。'));
  assert.deepEqual(completedFive.cake, before.cake);
  await screenshot('complete-390x844.png');
  console.log('PASS completion card has a name-ready temporary message; gauge and cue are hidden');
  const samples = [
    ['short', '短いお祝いメッセージです。'],
    ['exact-40', 'あ'.repeat(40)],
    ['over-40', 'あ'.repeat(42)]
  ];
  for (const [name, message] of samples) {
    const sample = await evaluate(`(() => { const slot = document.getElementById('message-slot'); slot.textContent = ${JSON.stringify(message)}; const r = slot.getBoundingClientRect(); return {height:r.height, scrollHeight:slot.scrollHeight, bottom:r.bottom}; })()`);
    assert.ok(sample.bottom <= 844);
    assert.ok(sample.scrollHeight <= sample.height, `${name} message fits in its reserved area`);
    await screenshot(`message-${name}-390x844.png`);
  }
  console.log('PASS short, 40-character, and 42-character messages fit in the reserved area');
  await evaluate(`document.getElementById('reset').click();document.getElementById('count').value='99';document.getElementById('count').dispatchEvent(new Event('input'));`);
  const before99 = await read(); checkFits(before99, false); assert.equal(before99.candleCount,99); assert.deepEqual(before99.cake,before.cake);
  await evaluate(`document.getElementById('start').click()`); await sleep(2500);
  const after99 = await read(); checkFits(after99, true); assert.equal(after99.candleCount,99); assert.deepEqual(after99.cake,before.cake);
  await screenshot('99-candles-390x844.png');
  console.log('PASS 99 candles fit and retain the same cake position');
  await evaluate(`for(let i=0;i<5;i++) document.getElementById('cake-button').click()`);
  const completed = await read(); checkFits(completed, false); assert.ok(!completed.bubble&&!completed.counter); assert.deepEqual(completed.cake,before.cake);
  console.log('PASS completion hides bubble and count together, without moving cake');
  await evaluate(`document.getElementById('reset').click();navigator.mediaDevices.getUserMedia=async()=>{throw new Error('denied')};document.getElementById('start').click()`);
  await sleep(100);
  const denied = await read(); checkFits(denied, true); assert.deepEqual(denied.cake,before.cake); assert.ok(denied.visibleText.includes('マイクはオフ'));
  console.log('PASS microphone denial remains usable and fits in the fixed card');
  await evaluate(`document.getElementById('sound-test').click()`);
  assert.ok((await read()).visibleText.includes('マナーモード'));
  console.log('PASS sound check reveals mute-mode guidance when requested');
  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => url.startsWith(origin) || url === 'about:blank'));
  console.log('PASS no browser runtime errors or external app requests');
  await writeFile(path.join(output,'layout-results.json'),JSON.stringify({renderer:'Headless Microsoft Edge (Chromium), simulated silent microphone; not physical iPhone',viewport:{width:390,height:844},before,after,completedFive,before99,after99,completed,denied,errors},null,2));
  await send('Browser.close').catch(()=>{});
} finally {
  ws?.close(); browser.kill(); server.close();
}
