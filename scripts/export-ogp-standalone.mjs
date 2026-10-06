import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve('dist/ogp.svg');
const target = path.resolve('dist/ogp-standalone.svg');
const svg = await readFile(source, 'utf8');
const references = [...svg.matchAll(/xlink:href="assets\/([^"/]+\.png)"/g)];

if (references.length !== 5) {
  throw new Error(`Expected five OGP image references, found ${references.length}`);
}

let standalone = svg;
for (const [, filename] of references) {
  const bytes = await readFile(path.resolve('dist/assets', filename));
  const dataUri = `data:image/png;base64,${bytes.toString('base64')}`;
  standalone = standalone.replace(`xlink:href="assets/${filename}"`, `xlink:href="${dataUri}"`);
}

await writeFile(target, standalone);
console.log(`Wrote ${target}`);
