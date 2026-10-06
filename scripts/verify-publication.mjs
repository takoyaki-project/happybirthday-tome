import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const site = 'https://takoyaki-project.github.io/happybirthday-tome/';
const [html, robots, sitemap, llms, ogp] = await Promise.all([
  readFile('dist/index.html', 'utf8'),
  readFile('dist/robots.txt', 'utf8'),
  readFile('dist/sitemap.xml', 'utf8'),
  readFile('dist/llms.txt', 'utf8'),
  readFile('dist/ogp.png'),
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
console.log('PASS public metadata, discovery files, and 1200×630 OGP image');
