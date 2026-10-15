import {readFile, writeFile} from 'node:fs/promises';

const site = 'https://takoyaki-project.github.io/happybirthday-tome/';
const title = 'お誕生日のお祝いが届いています';
const description = 'ケーキをタップして、ろうそくを消してね。';
let html = await readFile('dist/index.html', 'utf8');

function replaceOnce(before, after) {
  if (html.split(before).length !== 2) throw new Error(`Expected one occurrence of ${before}`);
  html = html.replace(before, after);
}

replaceOnce('<meta name="description" content="自分のために、思いっきりふーっ。声やタップでろうそくを消す、ちいさな誕生日パーティー。">', `<meta name="description" content="${description}">`);
replaceOnce('<meta name="robots" content="index,follow">', '<meta name="robots" content="noindex,nofollow">');
replaceOnce(`<link rel="canonical" href="${site}">`, `<link rel="canonical" href="${site}invite.html">`);
replaceOnce('<meta property="og:title" content="自分に、おめでとう。 | TAKOYAKI PROJECT">', `<meta property="og:title" content="${title}">`);
replaceOnce('<meta property="og:description" content="自分のために、思いっきりふーっ。声やタップでろうそくを消す、ちいさな誕生日パーティー。">', `<meta property="og:description" content="${description}">`);
replaceOnce(`<meta property="og:url" content="${site}">`, `<meta property="og:url" content="${site}invite.html">`);
replaceOnce(`<meta property="og:image" content="${site}ogp.png?v=2">`, `<meta property="og:image" content="${site}ogp-invite.png?v=2">`);
replaceOnce(`<meta name="twitter:image" content="${site}ogp.png?v=2">`, `<meta name="twitter:image" content="${site}ogp-invite.png?v=2">`);
replaceOnce('<meta name="twitter:card" content="summary_large_image">', `<meta name="twitter:card" content="summary_large_image">\n  <meta name="twitter:title" content="${title}">\n  <meta name="twitter:description" content="${description}">`);
replaceOnce('<title>自分に、おめでとう。 | TAKOYAKI PROJECT</title>', `<title>${title}</title>`);

await writeFile('dist/invite.html', html);
console.log('Wrote dist/invite.html');
