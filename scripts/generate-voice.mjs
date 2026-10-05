// Reproducible, local-only speech generation. No speech service at runtime.
import ESpeakNg from 'espeak-ng';
import { mkdir, writeFile } from 'node:fs/promises';

const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'rest', 'next', 'speed'];
let sampleRate;
const clips = {}, samples = [];
for (const word of words) {
  const engine = await ESpeakNg({ arguments: ['-v', 'en-us', '-s', '200', '-z', '-w', 'word.wav', word], print() {}, printErr() {} });
  const wav = Buffer.from(engine.FS.readFile('word.wav'));
  let pcm;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const tag = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (tag === 'fmt ') {
      if (wav.readUInt16LE(offset + 8) !== 1 || wav.readUInt16LE(offset + 10) !== 1 || wav.readUInt16LE(offset + 22) !== 16) throw new Error('Expected mono PCM16');
      const rate = wav.readUInt32LE(offset + 12);
      if (sampleRate && rate !== sampleRate) throw new Error('Mixed sample rates');
      sampleRate = rate;
    }
    if (tag === 'data') pcm = wav.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (!pcm) throw new Error(`No PCM for ${word}`);
  const values = Array.from({ length: pcm.length / 2 }, (_, i) => pcm.readInt16LE(i * 2));
  const peak = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const threshold = peak * 0.003;
  let first = values.findIndex(value => Math.abs(value) > threshold);
  let last = values.findLastIndex(value => Math.abs(value) > threshold);
  if (first < 0) throw new Error(`Silent word: ${word}`);
  const trimmed = values.slice(first, last + 1);
  const fade = Math.round(sampleRate * 0.001);
  clips[word] = { offset: samples.length, length: trimmed.length };
  for (let i = 0; i < trimmed.length; i++) {
    const envelope = Math.min(1, (i + 1) / fade, (trimmed.length - i) / fade);
    samples.push(Math.round(trimmed[i] / peak * 26000 * envelope));
  }
}
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
wav.writeUInt32LE(samples.length * 2, 40);
samples.forEach((sample, index) => wav.writeInt16LE(sample, 44 + index * 2));
await mkdir('public/audio', { recursive: true });
await writeFile('public/audio/counts-v1.wav', wav);
await writeFile('public/audio/counts-v1.json', JSON.stringify({ version: 1, sampleRate, generator: 'espeak-ng@1.0.2 / en-us / 200 words per minute; silence trimmed, normalized', clips }, null, 2) + '\n');
console.log(`Generated ${words.length} words, ${wav.length} bytes, ${sampleRate} Hz`);
