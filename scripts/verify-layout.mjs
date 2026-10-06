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
  const types = {html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8', css: 'text/css; charset=utf-8', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml'};
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
  const screenshot = async (name, height = 844) => {
    await evaluate('window.scrollTo(0,0)');
    assert.equal(await evaluate('scrollY'), 0);
    const shot = await send('Page.captureScreenshot', {format: 'png', clip: {x: 0, y: 0, width: await evaluate('innerWidth'), height, scale: 1}, captureBeyondViewport: true});
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

    assert.ok(bands.crowd.bottom < bands.note.top);
    return bands;
  };

  const entry = await read();
  fits(entry);
  assert.equal(entry.scene, 'entry'); assert.ok(entry.setup); assert.ok(!entry.cakeVisible);
  await screenshot('entry-390x844.png');

  await evaluate("document.getElementById('mode-plush').checked=true;document.getElementById('name').value='けいこ';document.getElementById('start').click()");
  await sleep(500);
  const plushPrepare = await evaluate("(()=>({scene:document.body.dataset.scene,visible:!!document.getElementById('plush-prepare').getClientRects().length,enabled:!document.getElementById('plush-pop').disabled,lyrics:!!document.getElementById('song-lyrics').getClientRects().length}))()");
  assert.deepEqual(plushPrepare, {scene: 'plush-prepare', visible: true, enabled: true, lyrics: false});
  await screenshot('plush-prepare-390x844.png');
  await evaluate("document.getElementById('plush-pop').click()");
  await sleep(250);
  const plushSong = await read();
  fits(plushSong); assert.equal(plushSong.scene, 'song'); assert.ok(plushSong.lyrics && !plushSong.bubble && !plushSong.gauge);
  await screenshot('plush-song-390x844.png');
  await evaluate("document.getElementById('reset').click()");

  await evaluate("delete window.__testSongDuration;document.getElementById('name').value='けいこ';document.getElementById('start').click()");
  await sleep(300); await screenshot('song-line-1-390x844.png');
  await sleep(3400); await screenshot('song-line-2-390x844.png');
  await sleep(3400);
  const song = await read();
  fits(song);
  assert.equal(song.scene, 'song'); assert.ok(song.cakeVisible && song.lyrics && !song.bubble && !song.counter && !song.gauge);
  assert.match(await evaluate("document.getElementById('song-lyrics').textContent"), /Dear けいこ/);
  assert.equal(song.background, 'rgb(25, 13, 29)');
  await screenshot('song-lyrics-390x844.png');
  await sleep(3600); await screenshot('song-line-4-390x844.png');
  await sleep(3300);
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

  await sleep(2500);
  const celebrateInitial = await read();
  fits(celebrateInitial);
  assert.equal(celebrateInitial.scene, 'celebrate'); assert.ok(celebrateInitial.cakeVisible && celebrateInitial.celebration); assert.equal(celebrateInitial.outCount, 5); assert.ok(celebrateInitial.mobCount >= 1 && celebrateInitial.mobCount < 40);
  assert.doesNotMatch(celebrateInitial.message, /あなた|さん/);
  await screenshot('celebrate-initial-390x844.png');

  await sleep(3500);
  const celebrate = await read();
  fits(celebrate);
  assert.equal(celebrate.mobCount, 40);
  await screenshot('celebrate-40-390x844.png');

  const setCelebrationCopy = async (title, message) => {
    await evaluate(`document.getElementById('celebration-title').textContent=${JSON.stringify(title)};document.getElementById('celebration-message').textContent=${JSON.stringify(message)};document.getElementById('party').classList.toggle('long-celebration-message',Array.from(${JSON.stringify(message)}).length>28);document.getElementById('party').classList.toggle('medium-celebration-message',Array.from(${JSON.stringify(message)}).length>16&&Array.from(${JSON.stringify(message)}).length<=28)`);
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

  await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 700, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 700});
  await sleep(120);
  const celebrateCompact = await read();
  assert.equal(celebrateCompact.scene, 'celebrate'); assert.equal(celebrateCompact.height, 700);
  assert.ok(celebrateCompact.scrollWidth <= 390); assert.ok(celebrateCompact.scrollHeight <= 700);
  assert.ok(celebrateCompact.celebrationMessage.bottom < celebrateCompact.cake.y);
  await screenshot('celebrate-frame-390x700.png', 700);


  // Inspect real motion as well as reduced motion, across narrow and short phones.
  const reviewDir = 'review-2026-10-06/after';
  await mkdir(path.join(output, reviewDir), {recursive: true});
  const review = [];
  const visibleBounds = selector => evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return{text:el.textContent.trim(),left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};})`);
  for (const [width, height] of [[320,700], [375,667], [390,844], [430,932]]) {
    const size = `${width}x${height}`;
    await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height});
    await send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'no-preference'}]});
    await evaluate("document.getElementById('reset').click();document.getElementById('name').value='けいこ';document.getElementById('count').value='5';document.getElementById('count').dispatchEvent(new Event('input'))");
    await sleep(120);
    const entryBounds = await visibleBounds('.eyebrow, .brand h1, .brand-copy, #setup, #start, .sound-hint');
    for (const box of entryBounds) { assert.ok(box.left >= 16 && box.right <= width-16, `entry width: ${size}`); assert.ok(box.bottom < height, `entry height: ${size}`); }
    assert.ok(entryBounds[0].top >= 70, 'curtains end above the brand');
    await screenshot(`${reviewDir}/entry-${size}.png`, height);
    await evaluate("document.getElementById('mode-plush').checked=true;document.getElementById('start').click()");
    await sleep(500);
    const guide = await visibleBounds('.plush-prepare p span, #plush-pop, .plush-tip');
    assert.equal(guide.length, 4);
    for (const box of guide) assert.ok(box.left >= 16 && box.right <= width-16 && box.scrollWidth <= box.clientWidth+1, `plush guide ${size}`);
    assert.ok(guide[0].bottom <= guide[1].top+1, 'instructions have two deliberate lines');
    const cakeInPreparation = (await visibleBounds('#cake-button'))[0];
    assert.ok(guide[3].bottom + 12 < cakeInPreparation.top, `sound-volume hint clears cake ${size}`);
    assert.equal(await evaluate("document.querySelector('#plush-pop img').naturalWidth > 0"), true);
    await screenshot(`${reviewDir}/plush-prepare-${size}.png`, height);
    const plushStartedAt = await evaluate('performance.now()');
    await evaluate("document.getElementById('plush-pop').click()");
    await sleep(250);
    assert.match(await evaluate("document.getElementById('song-lyrics').textContent"), /^Happy birthday\nto you$/);
    const lyric = (await visibleBounds('#song-lyrics'))[0];
    const retry = (await visibleBounds('#plush-again'))[0];
    assert.ok(lyric.left >= 16 && lyric.right <= width-16 && lyric.top >= 80 && lyric.scrollWidth <= lyric.clientWidth+1, 'lyrics fit below the curtains');
    assert.ok(retry.top > lyric.bottom && retry.right <= width-8 && retry.bottom <= height, 'retry stays below the lyrics');
    await screenshot(`${reviewDir}/plush-song-${size}.png`, height);
    if (width === 390) {
      await sleep(Math.max(0, 12300 - (await evaluate('performance.now()') - plushStartedAt)));
      assert.equal(await evaluate("document.getElementById('song-lyrics').textContent"), 'もうすぐ\nふーっ！');
      await sleep(Math.max(0, 13400 - (await evaluate('performance.now()') - plushStartedAt)));
      assert.equal(await evaluate("document.getElementById('song-lyrics').textContent"), 'ぬいぐるみに\nふーっ！');
      const blowGuide = (await visibleBounds('#song-lyrics'))[0];
      const plushCake = (await visibleBounds('#cake-button'))[0];
      assert.ok(blowGuide.bottom + 12 < plushCake.top, 'plush blow guide clears the cake');
      assert.equal(await evaluate("document.getElementById('volume-area').hidden"), true);
      await screenshot(`${reviewDir}/plush-blow-${size}.png`, height);
      await sleep(Math.max(0, 15200 - (await evaluate('performance.now()') - plushStartedAt)));
      assert.equal(await evaluate('document.body.dataset.scene'), 'blackout');
      await sleep(Math.max(0, 16300 - (await evaluate('performance.now()') - plushStartedAt)));
      assert.equal(await evaluate('document.body.dataset.scene'), 'celebrate');
      await screenshot(`${reviewDir}/plush-celebrate-${size}.png`, height);
    }
    await evaluate("document.getElementById('reset').click();window.__testSongDuration=100;document.getElementById('start').click()");
    await sleep(400);
    await evaluate("for(let i=0;i<5;i++)document.getElementById('cake-button').click()");
    await sleep(1100);
    const began = await evaluate('performance.now()');
    const timeline = [];
    for (const at of [500, 1100, 1900, 2900, 4200]) {
      await sleep(Math.max(0, at - (await evaluate('performance.now()')-began)));
      const count = await evaluate("document.querySelectorAll('.mob').length");
      timeline.push({msAfterCelebration: at+100, count});
      if (width === 390) await screenshot(`${reviewDir}/wave-${at+100}ms.png`, height);
    }
    assert.equal(timeline.at(-1).count, 40);
    assert.ok(timeline[0].count <= 2 && timeline[1].count <= 16);
    await evaluate("document.querySelectorAll('.mob.is-speaking .mob-shout').forEach((el,i)=>el.textContent=['さいこー！','おめでとー！','いえーい！'][i])");
    const shouts = await visibleBounds('.mob.is-speaking .mob-shout');
    assert.equal(shouts.length, 3);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.mob.is-speaking')).every(el=>Number(getComputedStyle(el).zIndex)>5)"), true);
    const frameBounds = (await visibleBounds('.frame-shell'))[0];
    const cakeBounds = (await visibleBounds('#cake'))[0];
    assert.ok(frameBounds.bottom + 8 <= cakeBounds.top, 'frame has breathing room above cake');
    for (const box of shouts) assert.ok(box.left >= 8 && box.right <= width-8 && box.top >= 0 && box.bottom <= height-30, `speech fits ${size}: ${JSON.stringify(box)}`);
    assert.equal(await evaluate("document.querySelectorAll('.mob').length"), 40);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight"), true);
    assert.equal(await evaluate("getComputedStyle(document.getElementById('plush-confetti')).display"), 'none');
    await screenshot(`${reviewDir}/celebrate-${size}.png`, height);
    review.push({width,height,timeline,shouts,entryBounds,guide});
  }
  await writeFile(path.join(output, 'review-2026-10-06/metrics.json'), JSON.stringify(review,null,2));
  console.log('PASS entry, cracker, shared English lyrics, real row waves and speech bounds at four phone sizes');
  console.log('PASS plush waits for the micro:bit breath window and celebrates at the scheduled time');

  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => url.startsWith(origin) || url === 'about:blank'));
  console.log('PASS entry hides the cake and fits at 390×844');
  console.log('PASS song shows name lyrics while cue, count, and gauge stay hidden until it ends');
  console.log('PASS microphone fallback control does not overlap the lyrics');
  console.log('PASS blackout keeps the cake fixed, hides the cue, shows smoke, and transitions within 1.5 seconds');
  console.log('PASS celebration introduces its crowd and reaches 40 layered mobs before the final capture');
  console.log('PASS celebration copy fits one line, 40 characters over three lines, and an eight-character name');
  console.log('PASS reset returns celebration to entry; 99 candles fit in song');
  console.log('PASS no browser runtime errors or external app requests');
  await writeFile(path.join(output, 'layout-results.json'), JSON.stringify({renderer: 'Headless Microsoft Edge (Chromium), simulated silent microphone; not physical iPhone', viewport: {width: 390, height: 844}, entry, song, blackout, celebrateInitial, celebrate, oneLine, threeLines, longName, song99, celebrate99, errors}, null, 2));
  await send('Browser.close').catch(() => {});
} finally {
  ws?.close(); browser.kill(); server.close();
}
