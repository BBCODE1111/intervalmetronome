import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as MetronomeStretch from '../src/stretch.js';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const voiceDataSource = readFileSync(new URL('../public/audio/voice-data.js', import.meta.url), 'utf8');
const commonWave = readFileSync(new URL('./fixtures/counts-natural-v4.wav', import.meta.url));
const extraWave = readFileSync(new URL('./fixtures/counts-natural-extra-v4.wav', import.meta.url));
const decodedCache = new Map();

const audioSource = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/audio/counts-v2.json', import.meta.url)));
const wave = readFileSync(new URL('../public/audio/counts-v2.wav', import.meta.url));

function createApp({ audio = true, loading = false, failed = false, sampleRate = manifest.sampleRate } = {}) {
  const elements = new Map();
  for (const match of html.matchAll(/<(?:input|select|button|div|span)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const tag = match[0], classes = new Set();
    elements.set(match[1], {
      value: tag.match(/\bvalue="([^"]+)"/)?.[1] || (match[1] === 'sigDenominator' ? '4' : ''),
      checked: /\bchecked\b/.test(tag), textContent: '', style: {}, listeners: {}, attrs: {},
      classList: { add: x => classes.add(x), remove: x => classes.delete(x) },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      setAttribute(key, value) { this.attrs[key] = value; }, focus() {},
      closest() { return { querySelectorAll: () => [{ classList: this.classList }, { classList: this.classList }] }; },
    });
  }
  let clock = 0, id = 0, resolveLoad;
  const gate = loading ? new Promise(resolve => { resolveLoad = resolve; }) : Promise.resolve();
  const timers = new Map(), clicks = [], voices = [], requests = [];
  function buffer(length, sampleRate) {
    const pcm = new Float32Array(length);
    return { length, sampleRate, duration: length / sampleRate, getChannelData: () => pcm };
  }
  class AudioContext {
    state = 'running'; destination = {};
    get currentTime() { return clock; }
    async resume() { this.state = 'running'; }
    createOscillator() {
      const click = {};
      return {
        frequency: { setValueAtTime: frequency => { click.frequency = frequency; } },
        connect() {}, disconnect() {},
        start(time) { click.time = time; clicks.push(click); },
        stop(time) { if (time === undefined) click.cancelled = true; },
      };
    }
    createBufferSource() {
      const voice = { playbackRate: { value: 1 }, connect() {}, disconnect() {},
        start(time) { this.time = time; voices.push(this); }, stop() { this.cancelled = true; } };
      return voice;
    }
    createBuffer(channels, length, rate) { return buffer(length, rate); }
    async decodeAudioData(data) {
      await gate;
      const kind = data.byteLength === 1 ? new Uint8Array(data)[0] : 0;
      const sourceWave = kind === 0 ? commonWave : kind === 1 ? extraWave : wave;
      const key = `${kind}:${sampleRate}`;
      if (!decodedCache.has(key)) {
        const decoded = buffer(Math.floor((sourceWave.length - 44) / 2 * sampleRate / manifest.sampleRate), sampleRate);
        const pcm = decoded.getChannelData(0);
        for (let i = 0; i < pcm.length; i++) pcm[i] = sourceWave.readInt16LE(44 + Math.floor(i * manifest.sampleRate / sampleRate) * 2) / 32768;
        decodedCache.set(key,decoded);
      }
      return decodedCache.get(key);
    }
    createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  const window = { addEventListener() {}, OfflineAudioContext: AudioContext };
  if (audio) window.AudioContext = AudioContext;
  const network = { failed };
  const context = vm.createContext({
    document: { getElementById: id => elements.get(id) }, window, AbortController, MetronomeStretch, atob: value=>Buffer.from(value,'base64').toString('binary'),
    async fetch(url) {
      requests.push(url); await gate;
      if (network.failed) throw new Error('offline');
      return { ok: true, json: async () => manifest, arrayBuffer: async () => new Uint8Array([url.includes('natural-extra') ? 1 : 2]).buffer };
    },
    setTimeout(fn, delay = 0) { const key = ++id; timers.set(key, { fn, at: clock + delay / 1000 }); return key; },
    clearTimeout: key => timers.delete(key), console,
  });
  vm.runInContext(voiceDataSource, context);
  vm.runInContext(audioSource, context);
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  function tick(seconds) {
    const end = clock + seconds;
    let count = 0;
    while (true) {
      const next = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      if (++count > 20000) throw new Error('Runaway timer');
      clock = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    clock = end;
  }
  return { run, tick, stall: seconds => { clock += seconds; }, elements, clicks, voices, timers, requests, resolveLoad, network };
}

function assertAligned(app, clickOffset = 0, count = 4) {
  assert.equal(app.voices.length, count);
  for (let i = 0; i < count; i++) {
    const voice = app.voices[i], click = app.clicks[i + clickOffset];
    assert.equal(voice.playbackRate.value, 1, 'voice pitch never changes with playback rate');
    assert.ok(Math.abs(voice.time + .02 - click.time) < 1e-9, 'retained consonant starts 20 ms before the click on the same audio clock');
    assert.ok(voice.buffer.getChannelData(0).some(sample => Math.abs(sample) > 0.01), 'non-silent actual voice sample');
    if (i + 1 < count) {
      assert.ok(voice.time + voice.buffer.duration / voice.playbackRate.value < app.voices[i + 1].time, 'entire number ends before next beat');
    }
    assert.deepEqual(voice.buffer.getChannelData(0), app.run(`sound.bufferFor(MetronomeAudio.numberWords(${i + 1}), beatDuration() * 0.985).getChannelData(0)`), 'correct spoken number');
  }
}

test('first cold start waits for required core voice data; second start uses decoded audio', async () => {
  const app = createApp({ loading: true });
  const starting = app.run('start()');
  app.tick(3);
  assert.equal(app.clicks.length, 0);
  assert.equal(app.voices.length, 0);
  assert.equal(app.elements.get('infoBar').textContent, 'PREPARING AUDIO…');
  app.resolveLoad(); await starting;
  assert.equal(app.clicks[0].time, 3.05);
  assert.equal(app.voices[0].time, 3.05 - .02);
  app.run('stop()');
  await app.run('start()');
  assert.ok(app.requests.every(url=>url.includes('natural-extra')), 'first 1–4 start makes no audio network request');
  assert.equal(app.voices[1].time, app.clicks[1].time - .02);
});

test('every BPM 30–400 and both note values have audible, non-overlapping count-in buffers', async () => {
  for (let tempo = 30; tempo <= 400; tempo++) {
    for (const note of ['4', '8']) {
      const app = createApp();
      app.run(`updateBPM(${tempo}); sigDenominator.value = '${note}'; intervalEnableToggle.checked = false`);
      await app.run('start()');
      const duration = (60 / tempo) * (note === '8' ? 0.5 : 1);
      app.tick(duration * 4);
      assertAligned(app);
      for (let beat = 0; beat < 4; beat++) {
        assert.ok(Math.abs(app.voices[beat].time - (0.05 + beat * duration - .02)) < 1e-9);
        assert.ok(app.voices[beat].buffer.duration / app.voices[beat].playbackRate.value <= duration * 0.985 + 1e-9);
      }
      app.run('stop()');
      assert.ok(app.voices.every(voice => voice.cancelled));
    }
  }
});

test('default is 4/4 and entered meters 3, 5, 7, 17, 21, 101 all speak the full count', async () => {
  const initial = createApp();
  assert.equal(initial.elements.get('sigNumerator').value, '4');
  assert.equal(initial.elements.get('sigDenominator').value, '4');
  assert.doesNotMatch(html.match(/<input[^>]+id="sigNumerator"[^>]+>/)[0], /max=/);
  for (const beats of [3, 5, 7, 17, 21, 101]) {
    const app = createApp();
    app.run(`sigNumerator.value = '${beats}'; intervalEnableToggle.checked = false; updateBPM(400)`);
    await app.run('start()');
    app.tick(beats * 0.15);
    assertAligned(app, 0, beats);
  }
});

test('all safe integer counts can be assembled without allocating an entire meter', async () => {
  const app = createApp();
  await app.run('sound = new MetronomeAudio.Engine(new window.AudioContext()); sound.ready(200)');
  const actual = words => Array.from(app.run(`MetronomeAudio.numberWords(${words})`));
  assert.deepEqual(actual(21), ['twenty', 'one']);
  assert.deepEqual(actual(105), ['one', 'hundred', 'five']);
  assert.deepEqual(actual(1000001), ['one', 'million', 'one']);
  const words = actual(Number.MAX_SAFE_INTEGER);
  assert.ok(words.includes('quadrillion'));
  assert.ok(words.every(word => manifest.clips[word]));
  app.run('for(let i = 1; i <= 200; i++) sound.bufferFor(MetronomeAudio.numberWords(i))');
  assert.equal(app.run('sound.cache.size'), 64);
});

test('decimal, empty, zero, negative and unsafe meter inputs block starting without truncation', async () => {
  for (const value of ['3.5', '3.0', '', '0', '-3', '1e3', '9007199254740992']) {
    const app = createApp();
    app.elements.get('sigNumerator').value = value;
    await app.run('start()');
    assert.equal(app.elements.get('sigNumerator').value, value);
    assert.equal(app.run('isPlaying'), false);
    assert.equal(app.clicks.length, 0);
    assert.equal(app.elements.get('sigNumerator').attrs['aria-invalid'], 'true');
  }
});

test('editing meter during count-in applies at the following measure boundary', async () => {
  const app = createApp();
  app.run('intervalEnableToggle.checked = false');
  await app.run('start()');
  await app.run('sound.ready(7)');
  app.run("sigNumerator.value = '7'; updateSigUI()");
  app.tick(1.8);
  assert.equal(app.voices.length, 4);
  assert.equal(app.run('measureBeats'), 4);
  app.tick(0.3);
  assert.equal(app.run('measureBeats'), 7);
});

test('transition count-in follows the new tempo on the exact measure boundary', async () => {
  const app = createApp();
  app.run("startCueToggle.checked = false; stepMeasures.value = '1'; restEnableToggle.checked = false; stepAmount.value = '40'; targetBPM.value = '160'");
  await app.run('start()'); app.tick(3.6);
  assertAligned(app, 4);
  assert.equal(app.voices[0].time, 2.05 - .02);
  assert.equal(app.voices[1].time - app.voices[0].time, 60 / 160);
});

test('quarter notes have accented downbeats and eighth notes halve the interval', async () => {
  for (const note of [4, 8]) {
    const app = createApp();
    app.run(`startCueToggle.checked = false; intervalEnableToggle.checked = false; sigDenominator.value = '${note}'`);
    await app.run('start()'); app.tick(2.2);
    const duration = note === 4 ? 0.5 : 0.25;
    assert.deepEqual(app.clicks.slice(0, 5).map(x => x.time), Array.from({ length: 5 }, (_, i) => 0.05 + i * duration));
    assert.deepEqual(app.clicks.slice(0, 5).map(x => x.frequency), [1600, 900, 900, 900, 1600]);
    assert.equal(app.voices.length, 0);
  }
});

test('tempo increment preserves the old final beat duration', async () => {
  const app = createApp();
  app.run("startCueToggle.checked = false; changeCueToggle.checked = false; restEnableToggle.checked = false; stepMeasures.value = '1'");
  await app.run('start()'); app.tick(2.7);
  assert.equal(app.clicks[4].time, 2.05);
  assert.ok(Math.abs(app.clicks[5].time - app.clicks[4].time - 60 / 130) < 1e-9);
});

test('rest starts at measure end, speaks within the rest and resumes with aligned count-in', async () => {
  const app = createApp();
  app.run("sigNumerator.value = '1'; stepMeasures.value = '1'; restIntervals.value = '1'; restSeconds.value = '1'; targetBPM.value = '130'");
  await app.run('start()'); await app.run('MetronomeAudio.preloadExtra()'); app.tick(2.3);
  assert.equal(app.voices[1].time, 1.05); // Rest after cue + one practice beat.
  assert.ok(app.voices[1].time + app.voices[1].buffer.duration / app.voices[1].playbackRate.value < 2.05);
  assert.equal(app.voices[2].time, 2.05 - .02);
  assert.equal(app.clicks[2].time, 2.05);
  assert.equal(app.run('bpm'), 130);
  app.run('stop()');
  assert.equal(app.timers.size, 0);
  assert.ok(app.voices.every(voice => voice.cancelled));
});

test('stopping during rest clears all audio and restarting plays immediately', async () => {
  const app = createApp();
  app.run("startCueToggle.checked = false; sigNumerator.value = '1'; stepMeasures.value = '1'; restIntervals.value = '1'");
  await app.run('start()'); await app.run('MetronomeAudio.preloadExtra()'); app.tick(0.6);
  assert.equal(app.run('isResting'), true);
  app.run('stop()');
  assert.equal(app.run('isResting'), false);
  assert.equal(app.timers.size, 0);
  assert.ok(app.voices.every(voice => voice.cancelled));
  app.run('intervalEnableToggle.checked = false; startCueToggle.checked = true');
  await app.run('start()');
  assert.equal(app.voices.at(-1).time, app.clicks.at(-1).time - .02);
});

test('target reached and lower targets do not trigger phantom increments', async () => {
  for (const target of [60, 120]) {
    const app = createApp();
    app.run(`startCueToggle.checked = false; sigNumerator.value = '1'; stepMeasures.value = '1'; targetBPM.value = '${target}'; restIntervals.value = '1'`);
    await app.run('start()'); app.tick(4);
    assert.equal(app.run('incrementCount'), 0);
    assert.equal(app.run('isResting'), false);
    assert.equal(app.run('bpm'), 120);
  }
});

test('volume changes control the common voice and click output immediately', async () => {
  const app = createApp();
  await app.run('start()');
  assert.equal(app.run('sound.master.gain.value'), 0.8);
  app.elements.get('volumeSlider').listeners.input({ target: { value: '0' } });
  assert.equal(app.run('sound.master.gain.value'), 0);
  app.elements.get('volumeSlider').listeners.input({ target: { value: '50' } });
  assert.equal(app.run('sound.master.gain.value'), 0.5);
});

test('unavailable audio and failed voice loads cannot silently start; failed fetch is retryable', async () => {
  for (const options of [{ audio: false }, { failed: true }]) {
    const app = createApp(options);
    if (options.failed) app.run("sigNumerator.value = '17'");
    await app.run('start()');
    assert.equal(app.run('isPlaying'), false);
    assert.equal(app.clicks.length, 0);
    assert.match(app.elements.get('infoBar').textContent, /AUDIO UNAVAILABLE/);
    if (options.failed) {
      app.network.failed = false;
      await app.run('start()');
      assert.equal(app.voices[0].time, app.clicks[0].time - .02);
    }
  }
});

test('stop/restart while loading cannot launch the cancelled scheduler', async () => {
  const app = createApp({ loading: true });
  const first = app.run('start()'); app.run('stop()');
  const second = app.run('start()');
  app.resolveLoad(); await Promise.all([first, second]);
  await app.run('MetronomeAudio.preloadExtra()');
  assert.equal(app.voices.length, 1);
  assert.equal(app.clicks.length, 1);
  app.run('stop()');
  assert.equal(app.timers.size, 0);
});

test('an old failed start cannot stop a newer session', async () => {
  const app = createApp();
  app.run("audioCtx = new window.AudioContext(); audioCtx.state = 'suspended'; audioCtx.resume = () => new Promise((resolve, reject) => { window.rejectResume = reject; })");
  const first = app.run('start()'); app.run("stop(); audioCtx.state = 'running'");
  await app.run('start()'); app.run("window.rejectResume(new Error('cancelled resume'))");
  await first;
  assert.equal(app.run('isPlaying'), true);
  assert.equal(app.voices.length, 1);
});


test('voice bank handles a resampler flooring the last frame at 44.1 kHz', async () => {
  const app = createApp({ sampleRate: 44100 });
  app.run("sigNumerator.value = '17'");
  await app.run('start()');
  assert.equal(app.run('sound.sampleRate'), 44100);
  assert.ok(app.run('sound.clips.speed.length') > 0);
  assert.equal(app.voices.length, 1);
  assert.equal(app.voices[0].time, app.clicks[0].time - .02);
});


test('a delayed scheduler never collapses missed voices and clicks into a burst', async () => {
  const app = createApp();
  app.run("updateBPM(400); sigDenominator.value = '8'; intervalEnableToggle.checked = false");
  await app.run('start()');
  app.stall(0.2);
  app.run('clearTimeout(timerID); scheduler()');
  assert.equal(app.voices[1].time, app.clicks[1].time - .02);
  assert.ok(app.voices[1].time >= 0.22);
  for (let i = 1; i < app.voices.length; i++) {
    const previous = app.voices[i - 1];
    assert.ok(app.voices[i].time > previous.time + previous.buffer.duration / previous.playbackRate.value);
  }
});


test('the default count-in starts with unavailable network and never runs a time stretcher', async () => {
  const app = createApp({failed:true});
  app.run("MetronomeStretch = {fitSpeech(){throw new Error('Runtime stretch attempted')}}; intervalEnableToggle.checked = false");
  await app.run('start()'); app.tick(2);
  assertAligned(app);
});

test('all common recorded numbers use prebuilt lengths at every supported tempo', async () => {
  const app = createApp();
  await app.run('sound = new MetronomeAudio.Engine(new window.AudioContext()); sound.ready(10)');
  app.run("MetronomeStretch = {fitSpeech(){throw new Error('Runtime stretch attempted')}}");
  for (let tempo=30;tempo<=400;tempo++) for(const note of [4,8]) for(let number=1;number<=10;number++) {
    const duration=60/tempo*(note===8?.5:1);
    const b=app.run(`sound.bufferFor(MetronomeAudio.numberWords(${number}),${duration}*.985)`);
    assert.ok(b.duration <= duration*.985+1/24000);
    assert.ok(b.getChannelData(0).some(x=>Math.abs(x)>.01));
  }
});

test('the entire bundled core voice transfer stays below 100 KB with gzip', () => {
  assert.ok(gzipSync(voiceDataSource).length < 100000);
});
