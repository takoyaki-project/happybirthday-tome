import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const site = 'https://takoyaki-project.github.io/happybirthday-tome/';
const [html, inviteHtml, robots, sitemap, llms, ogp, inviteOgp] = await Promise.all([
  readFile('dist/index.html', 'utf8'),
  readFile('dist/invite.html', 'utf8'),
  readFile('dist/robots.txt', 'utf8'),
  readFile('dist/sitemap.xml', 'utf8'),
  readFile('dist/llms.txt', 'utf8'),
  readFile('dist/ogp.png'),
  readFile('dist/ogp-invite.png'),
]);

assert.equal((html.match(/<title>/g) || []).length, 1);
assert.equal((html.match(/name="viewport"/g) || []).length, 1);
assert.equal((html.match(/name="robots"/g) || []).length, 1);
assert.match(html, /<meta name="robots" content="index,follow">/);
assert.ok(html.includes(`<link rel="canonical" href="${site}">`));
assert.ok(html.includes(`<meta property="og:image" content="${site}ogp.png?v=2">`));
assert.ok(html.includes(`<meta name="twitter:image" content="${site}ogp.png?v=2">`));
assert.ok(html.includes('<meta name="author" content="TAKOYAKI PROJECT">'));
assert.ok(robots.includes(`Sitemap: ${site}sitemap.xml`));
assert.ok(sitemap.includes(`<loc>${site}</loc>`));
assert.ok(llms.includes(site));
assert.equal(ogp.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.deepEqual([ogp.readUInt32BE(16), ogp.readUInt32BE(20)], [1200, 630]);
assert.ok(inviteHtml.includes('<title>お誕生日のお祝いが届いています</title>'));
assert.ok(inviteHtml.includes('<meta name="robots" content="noindex,nofollow">'));
assert.ok(inviteHtml.includes(`<link rel="canonical" href="${site}invite.html">`));
assert.ok(inviteHtml.includes(`<meta property="og:url" content="${site}invite.html">`));
assert.ok(inviteHtml.includes(`<meta property="og:title" content="お誕生日のお祝いが届いています">`));
assert.ok(inviteHtml.includes(`<meta name="twitter:title" content="お誕生日のお祝いが届いています">`));
assert.ok(inviteHtml.includes(`<meta property="og:image" content="${site}ogp-invite.png?v=2">`));
assert.ok(inviteHtml.includes(`<meta name="twitter:image" content="${site}ogp-invite.png?v=2">`));
assert.ok(inviteHtml.includes('<meta name="description" content="ケーキをタップして、ろうそくを消してね。">'));
assert.ok(inviteHtml.includes('<meta property="og:description" content="ケーキをタップして、ろうそくを消してね。">'));
assert.ok(inviteHtml.includes('<meta name="twitter:description" content="ケーキをタップして、ろうそくを消してね。">'));
assert.equal(inviteHtml.slice(inviteHtml.indexOf('<body>')), html.slice(html.indexOf('<body>')), 'invite and index bodies stay identical');
assert.equal(inviteOgp.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.deepEqual([inviteOgp.readUInt32BE(16), inviteOgp.readUInt32BE(20)], [1200, 630]);
assert.ok(!sitemap.includes('invite.html') && !llms.includes('invite.html'));
assert.ok(!robots.includes('Disallow: /happybirthday-tome/invite.html'));
console.log('PASS public metadata, discovery files, and both 1200×630 OGP images');
