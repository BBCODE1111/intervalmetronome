// Generate the same eight numbers for all three free female voice options.
import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fitSpeech } from '../../src/stretch.js';
env.cacheDir = resolve('artifacts/voice-model');
const destination = resolve('artifacts/voice-options');
await mkdir(destination, {recursive:true});
const rate=24000, words=['one','two','three','four','five','six','seven','eight'];
const model='onnx-community/Kokoro-82M-v1.0-ONNX';
const tts=await KokoroTTS.from_pretrained(model,{dtype:'fp32',device:'cpu'});
function trim(samples) {
  const peak=samples.reduce((m,x)=>Math.max(m,Math.abs(x)),0), threshold=peak*.002;
  const start=samples.findIndex(x=>Math.abs(x)>threshold), end=samples.findLastIndex(x=>Math.abs(x)>threshold);
  if(start<0) throw new Error('Silent sample');
  return samples.slice(start,end+1).map((x,i,array)=>x/peak*(24500/32768)*Math.min(1,(i+1)/24,(array.length-i)/24));
}
function wave(pcm) {
  const out=Buffer.alloc(44+pcm.length*2);
  out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);
  out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);
  out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);
  out.write('data',36);out.writeUInt32LE(pcm.length*2,40);
  pcm.forEach((x,i)=>out.writeInt16LE(Math.round(Math.max(-1,Math.min(1,x))*32767),44+i*2));return out;
}
const report=[];
for(const voice of ['af_heart','af_bella','af_sarah']) {
  const samples=[];
  for(const word of words) {
    const audio=await tts.generate(word+'.',{voice,speed:1.3});samples.push(trim(audio.audio));
  }
  for(const effective of [80,120,160,180,240,360,400,480,800]) {
    const duration=60/effective, out=new Float32Array(Math.ceil((.12+8*duration+.15)*rate));
    samples.forEach((original,index)=>{
      const fitted=fitSpeech(original,rate,duration*.85), offset=Math.round((.12+index*duration)*rate);
      for(let i=0;i<fitted.length;i++)out[offset+i]+=fitted[i]*.8;
      for(let i=0;i<Math.round(rate*.035);i++) {
        const t=i/rate, click=2/Math.PI*Math.asin(Math.sin(2*Math.PI*1600*t));
        out[offset+i]+=click*.18*Math.pow(.0001/.18,t/.035)*.8;
      }
    });
    const filename=`${voice}-${effective}.wav`;
    await writeFile(resolve(destination,filename),wave(out));
    report.push({voice,effective,filename,duration:out.length/rate});
  }
  console.log('Generated',voice,'at 9 speeds');
}
await tts.model.dispose();
await writeFile(resolve(destination,'manifest.json'),JSON.stringify({model,source:'https://huggingface.co/hexgrad/Kokoro-82M',modelLicense:'Apache-2.0',generator:'kokoro-js@1.2.1',timeStretch:'@soundtouchjs/core@2.1.1',speed:1.3,sampleRate:rate,pitch:'preserved; playback rate 1',files:report},null,2)+'\n');
