// Offline preparation. Run on macOS (afconvert) after npm ci --prefix scripts/recorded-voice.
import {OggVorbisDecoder} from '@wasm-audio-decoders/ogg-vorbis';
import {Stretch, CircularSampleBuffer} from '@soundtouchjs/core';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const rate=24000, words=['one','two','three','four','five','six','seven','eight','nine','ten'];
const caps=[Infinity,...[100,120,140,160,180,210,240,280,320,400,500,640,800].map(bpm=>60/bpm*.98)];
const temp='artifacts/recorded-voice';await mkdir(temp,{recursive:true});
await mkdir('public/audio',{recursive:true});
function wav(pcm,sr=rate){const b=Buffer.alloc(44+pcm.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length*2,40);pcm.forEach((x,i)=>b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,x))*32767),44+i*2));return b;}
function readWave(b){let offset=12,data;while(offset+8<=b.length){const size=b.readUInt32LE(offset+4);if(b.toString('ascii',offset,offset+4)==='data'){data=b.subarray(offset+8,offset+8+size);break;}offset+=8+size+(size%2);}return Float32Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768);}
function trim(pcm){const peak=pcm.reduce((m,x)=>Math.max(m,Math.abs(x)),0);const start=pcm.findIndex(x=>Math.abs(x)>peak*.004),end=pcm.findLastIndex(x=>Math.abs(x)>peak*.004);if(start<0)throw new Error('Silent clip');return pcm.slice(start,end+1).map(x=>x/peak*.65);}
function fit(pcm,seconds){if(pcm.length<=seconds*rate)return pcm;let tempo=pcm.length/(seconds*rate),out;
 for(let attempt=0;attempt<5;attempt++){
  const s=new Stretch({sampleRate:rate,createBuffers:true,sampleBufferFactory:()=>new CircularSampleBuffer()});
  s.setStretchParameters({sequenceMs:seconds>=.3?60:seconds>=.15?35:25,seekWindowMs:20,overlapMs:seconds>=.3?12:5,quickSeek:false});s.tempo=tempo;
  const input=new Float32Array((pcm.length+Math.ceil(rate*.15*tempo))*2);pcm.forEach((x,i)=>{input[i*2]=input[i*2+1]=x;});s.inputBuffer.putSamples(input);s.process();const stereo=new Float32Array(s.outputBuffer.frameCount*2);s.outputBuffer.extract(stereo);out=trim(Float32Array.from({length:stereo.length/2},(_,i)=>stereo[i*2]));
  if(out.length<=seconds*rate)break;tempo*=out.length/(seconds*rate)*1.01;
 }
 out=out.slice(0,Math.floor(seconds*rate));for(let i=0;i<24;i++){out[i]*=(i+1)/24;out[out.length-1-i]*=(i+1)/24;}return out;
}
const decoder=new OggVorbisDecoder();await decoder.ready;const clips={},samples=[];
function append(pcm){const offset=samples.length;for(const x of pcm)samples.push(x);for(let i=0;i<rate*.04;i++)samples.push(0);return{offset,length:pcm.length};}
for(let n=1;n<=10;n++){
 const decoded=await decoder.decodeFile(await readFile(new URL(`./source/${n}.ogg`,import.meta.url)));if(decoded.errors.length)throw new Error(JSON.stringify(decoded.errors));
 const mono=Float32Array.from({length:decoded.samplesDecoded},(_,i)=>decoded.channelData.reduce((s,c)=>s+c[i],0)/decoded.channelData.length);
 await writeFile(`${temp}/original.wav`,wav(mono,decoded.sampleRate));execFileSync('afconvert',[`${temp}/original.wav`,`${temp}/resampled.wav`,'-f','WAVE','-d','LEI16@24000','-c','1']);
 const original=trim(readWave(await readFile(`${temp}/resampled.wav`)));const entries=[];
 for(const cap of caps){if(entries.length&&original.length<=cap*rate)continue;const pcm=fit(original,cap);entries.push({cap:Number.isFinite(cap)?cap:null,...append(pcm)});}
 clips[words[n-1]]=entries;console.log(n,entries.length,'prepared lengths');await decoder.reset();
}
decoder.free();
const old=JSON.parse(await readFile('public/audio/counts-v2.json','utf8')),oldWav=await readFile('public/audio/counts-v2.wav');
const restRange=old.clips.rest;const rest=Float32Array.from({length:restRange.length},(_,i)=>oldWav.readInt16LE(44+(restRange.offset+i)*2)/32768);clips.rest=[{cap:null,...append(rest)}];
await mkdir('tests/fixtures',{recursive:true});
async function encodeBank(names,filename){
 const bank=[],ranges={};
 for(const word of names){ranges[word]=clips[word].map(entry=>{const start=bank.length;for(const x of samples.slice(entry.offset,entry.offset+entry.length))bank.push(x);for(let i=0;i<rate*.04;i++)bank.push(0);return{cap:entry.cap,offset:start,length:entry.length};});}
 const file=`tests/fixtures/${filename}.wav`;await writeFile(file,wav(Float32Array.from(bank)));
 execFileSync('afconvert',[file,`public/audio/${filename}.m4a`,'-f','m4af','-d','aac@24000','-c','1','-b','40000','-q','127','--no-filler']);
 const encoded=await readFile(`public/audio/${filename}.m4a`);
 return {clips:ranges,bytes:encoded.length,sha256:createHash('sha256').update(encoded).digest('hex'),encoded:encoded.toString('base64')};
}
const common=await encodeBank([...words.slice(0,4),'rest'],'counts-natural-v3');
const extra=await encodeBank(words.slice(4),'counts-natural-extra-v3');
const manifest={version:3,sampleRate:rate,source:'https://kenney.nl/assets/voiceover-pack',voice:'Giselle / Kenney Voiceover Pack',license:'CC0',processing:'Offline length variants, pitch preserved; runtime playbackRate 1',caps:caps.map(x=>Number.isFinite(x)?x:null),sha256:common.sha256,clips:common.clips,extra:{clips:extra.clips,src:'./assets/audio/counts-natural-extra-v3.m4a',sha256:extra.sha256}};
await writeFile('public/audio/counts-natural-v3.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('public/audio/voice-data.js','// Prepared voice samples: Kenney (CC0); rest prompt: Kokoro Sarah. See THIRD_PARTY_NOTICES.md.\nglobalThis.MetronomeVoiceData='+JSON.stringify({...manifest,encoded:common.encoded})+';\n');
await copyFile(new URL('./source/License.txt',import.meta.url),'public/audio/Kenney-CC0.txt');
execFileSync('afconvert',['public/audio/counts-v2.wav','public/audio/counts-extended-v3.m4a','-f','m4af','-d','aac@24000','-c','1','-b','48000','-q','127','--no-filler']);
console.log(JSON.stringify({commonBytes:common.bytes,extraBytes:extra.bytes,variants:Object.values(clips).reduce((s,v)=>s+v.length,0)}));
