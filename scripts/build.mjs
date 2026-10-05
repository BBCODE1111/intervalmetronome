import { mkdir, rm, cp, copyFile, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compile, optimize } from '@tailwindcss/node';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets/fonts', { recursive: true });
await mkdir('dist/licenses', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await copyFile('src/app.js', 'dist/assets/app.js');
await copyFile('src/audio.js', 'dist/assets/audio.js');
await cp('public/audio', 'dist/assets/audio', { recursive: true });
await copyFile('public/favicon.svg', 'dist/favicon.svg');
await copyFile('README.md', 'dist/README.md');
await copyFile('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');
await writeFile('dist/.nojekyll', '');
for (const weight of [400, 700]) {
  const file = `orbitron-latin-${weight}-normal.woff2`;
  await copyFile(`node_modules/@fontsource/orbitron/files/${file}`, `dist/assets/fonts/${file}`);
}
await copyFile('node_modules/@fontsource/orbitron/LICENSE', 'dist/licenses/Orbitron-OFL.txt');
await copyFile('node_modules/tailwindcss/LICENSE', 'dist/licenses/Tailwind-MIT.txt');
const html = await readFile('dist/index.html', 'utf8');
// This static page declares its utility classes in HTML; dynamic state classes
// (active, active-on, active-off) are authored directly in src/styles.css.
const candidates = [...new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/)))];
const compiler = await compile(await readFile('src/styles.css', 'utf8'), {
  base: resolve('src'), onDependency() {},
});
const css = optimize(compiler.build(candidates), { minify: true }).code;
await writeFile('dist/assets/styles.css', css);
if (/<(?:script|link)\b[^>]+(?:src|href)=["']https?:/i.test(html)) {
  throw new Error('The release must use bundled scripts and styles.');
}
console.log('Built self-contained static website in dist/');
