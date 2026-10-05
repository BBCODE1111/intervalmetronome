// Offline asset generation only; the browser never downloads this model.
import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';
import { resolve } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
env.cacheDir = resolve('artifacts/voice-model');
const model = 'onnx-community/Kokoro-82M-v1.0-ONNX', voice = 'af_sarah', speed = 1.3;
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'rest', 'next', 'speed'];
console.log('Loading the female voice generator');
const tts = await KokoroTTS.from_pretrained(model, { dtype:'fp32', device:'cpu' });
const sampleRate = 24000, samples = [], clips = {};
for (const word of words) {
  const audio = await tts.generate(word + '.', { voice, speed });
  if(audio.sampling_rate !== sampleRate) throw new Error('Unexpected sample rate');
  const pcm = audio.audio;
  const peak = pcm.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0);
  const threshold = peak * .002;
  const first = pcm.findIndex(sample => Math.abs(sample) > threshold);
  const last = pcm.findLastIndex(sample => Math.abs(sample) > threshold);
  if(first < 0) throw new Error(`Silent voice: ${word}`);
  const trimmed = pcm.slice(first, last + 1);
  clips[word] = {offset:samples.length, length:trimmed.length};
  const fade = Math.round(sampleRate * .001);
  for(let i=0; i<trimmed.length; i++) {
    const envelope = Math.min(1,(i+1)/fade,(trimmed.length-i)/fade);
    samples.push(Math.round(trimmed[i]/peak*24500*envelope));
  }
  console.log(word, (trimmed.length / sampleRate).toFixed(3));
}
await tts.model.dispose();
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
wav.writeUInt32LE(samples.length * 2, 40);
samples.forEach((sample,index) => wav.writeInt16LE(sample,44+index*2));
const hash = data => createHash('sha256').update(data).digest('hex');
const modelSha256 = hash(await readFile(resolve(env.cacheDir,model,'onnx/model.onnx')));
const voiceSha256 = hash(await readFile(new URL(`./node_modules/kokoro-js/voices/${voice}.bin`,import.meta.url)));
await mkdir('public/audio',{recursive:true});
await writeFile('public/audio/counts-v2.wav',wav);
await writeFile('public/audio/counts-v2.json',JSON.stringify({version:2,sampleRate,generator:'kokoro-js@1.2.1',model,modelSha256,voice,voiceSha256,speed,clips},null,2)+'\n');
console.log(`Generated ${words.length} female voice clips; ${wav.length} bytes`);
