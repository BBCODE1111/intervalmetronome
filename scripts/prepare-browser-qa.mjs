import { copyFile, readFile, writeFile } from 'node:fs/promises';
await copyFile('tests/browser/audio-qa.html', 'dist/audio-qa.html');
await copyFile('scripts/recorded-voice/attack.mjs', 'dist/assets/voice-attack-qa.js');
const html = await readFile('dist/index.html', 'utf8');
const probe = await readFile('tests/browser/live-probe.js', 'utf8');
await writeFile('dist/assets/live-probe.js', probe);
await writeFile('dist/live-qa.html', html.replace('<script src="./assets/app.js', '<script src="./assets/live-probe.js" defer></script>\n    <script src="./assets/app.js'));
console.log('Local-only QA: /intervalmetronome/audio-qa.html and /intervalmetronome/live-qa.html. Rebuild removes both.');
