import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function createApp({ speech = true, audio = true } = {}) {
  const elements = new Map();
  for (const match of html.matchAll(/<(?:input|select|button|div|span)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const tag = match[0];
    const classes = new Set();
    elements.set(match[1], {
      value: tag.match(/\bvalue="([^"]+)"/)?.[1] || (match[1] === 'sigDenominator' ? '4' : ''),
      checked: /\bchecked\b/.test(tag), textContent: '', style: {}, listeners: {}, attrs: {},
      classList: { add: x => classes.add(x), remove: x => classes.delete(x) },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      setAttribute(key, value) { this.attrs[key] = value; },
      closest() { return { querySelectorAll: () => [{ classList: this.classList }, { classList: this.classList }] }; },
    });
  }
  let clock = 0, id = 0;
  const timers = new Map();
  const clicks = [], spoken = [], speechEvents = [];
  class AudioContext {
    state = 'running';
    destination = {};
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
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  const speechSynthesis = {
    speak(utterance) {
      spoken.push(utterance);
      speechEvents.push({ type: 'speak', time: clock, text: utterance.text, rate: utterance.rate });
    },
    cancel() { speechEvents.push({ type: 'cancel', time: clock }); },
  };
  const window = { addEventListener() {} };
  if (audio) window.AudioContext = AudioContext;
  if (speech) Object.assign(window, { speechSynthesis, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } } });
  const context = vm.createContext({
    document: { getElementById: id => elements.get(id) }, window,
    SpeechSynthesisUtterance: window.SpeechSynthesisUtterance,
    setTimeout(fn, delay = 0) { const key = ++id; timers.set(key, { fn, at: clock + delay / 1000 }); return key; },
    clearTimeout: key => timers.delete(key), console,
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  function tick(seconds) {
    const end = clock + seconds;
    let count = 0;
    while (true) {
      const next = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      if (++count > 20000) throw new Error('Runaway timer');
      clock = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    clock = end;
  }
  return { run, tick, elements, clicks, spoken, speechEvents, timers };
}

test('count-in keeps the original uninterrupted speech queue at multiple tempos and signatures', async () => {
  for (const tempo of [60, 120, 180, 240]) {
    for (const note of ['4', '8']) {
      const app = createApp();
      app.run(`updateBPM(${tempo}); sigDenominator.value = '${note}'; intervalEnableToggle.checked = false`);
      await app.run('start()');
      const duration = (60 / tempo) * (note === '8' ? 0.5 : 1);
      app.tick(duration * 4);
      const speech = app.speechEvents.filter(event => event.type === 'speak');
      assert.deepEqual(speech.map(event => event.text), ['One', 'Two', 'Three', 'Four']);
      assert.equal(app.speechEvents.filter(event => event.type === 'cancel').length, 0, `${tempo} BPM /${note} must not interrupt count-in speech`);
      for (let beat = 0; beat < 4; beat++) {
        assert.ok(Math.abs(speech[beat].time - (app.clicks[beat].time - 0.03)) < 1e-9);
        assert.equal(speech[beat].rate, Math.min(Math.max(tempo / (note === '8' ? 160 : 100), 1.3), 3.5));
      }
      app.run('stop()');
      assert.equal(app.speechEvents.filter(event => event.type === 'cancel').length, 1);
    }
  }
});

test('transition count-in uses the new tempo without cancelling each spoken beat', async () => {
  const app = createApp();
  app.run("startCueToggle.checked = false; stepMeasures.value = '1'; restEnableToggle.checked = false; stepAmount.value = '40'; targetBPM.value = '160'");
  await app.run('start()');
  app.tick(3.6);
  const speech = app.speechEvents.filter(event => event.type === 'speak');
  assert.deepEqual(speech.map(event => event.text), ['One', 'Two', 'Three', 'Four']);
  assert.equal(app.speechEvents.filter(event => event.type === 'cancel').length, 0);
  for (let beat = 0; beat < 4; beat++) {
    assert.ok(Math.abs(speech[beat].time - (app.clicks[beat + 4].time - 0.03)) < 1e-9);
    assert.equal(speech[beat].rate, 1.6);
  }
});

test('blank and out-of-range BPM stay finite and synchronized', () => {
  const app = createApp();
  app.run("updateBPM(''); updateBPM('garbage')");
  assert.equal(app.run('bpm'), 120);
  app.run('updateBPM(999)');
  assert.equal(app.run('bpm'), 400);
  assert.equal(Number(app.elements.get('bpmSlider').value), 400);
  app.run('updateBPM(-10)');
  assert.equal(app.run('bpm'), 30);
});

test('numeric controls normalize unsafe values before starting', async () => {
  const app = createApp();
  app.elements.get('sigNumerator').value = '';
  app.elements.get('restSeconds').value = '-1';
  app.elements.get('stepAmount').value = '999';
  await app.run('start()');
  assert.equal(Number(app.elements.get('sigNumerator').value), 4);
  assert.equal(Number(app.elements.get('restSeconds').value), 1);
  assert.equal(Number(app.elements.get('stepAmount').value), 100);
  app.run('stop()');
});

test('quarter notes at 120 BPM are 0.5 seconds apart with an accented downbeat', async () => {
  const app = createApp();
  app.run('startCueToggle.checked = false; intervalEnableToggle.checked = false');
  await app.run('start()');
  app.tick(2.2);
  assert.deepEqual(app.clicks.slice(0, 5).map(x => Number(x.time.toFixed(2))), [0.05, 0.55, 1.05, 1.55, 2.05]);
  assert.deepEqual(app.clicks.slice(0, 5).map(x => x.frequency), [1600, 900, 900, 900, 1600]);
});

test('eighth-note signature halves the beat interval', async () => {
  const app = createApp();
  app.run("startCueToggle.checked = false; sigDenominator.value = '8'");
  await app.run('start()');
  app.tick(0.8);
  assert.deepEqual(app.clicks.slice(0, 4).map(x => Number(x.time.toFixed(2))), [0.05, 0.3, 0.55, 0.8]);
});

test('tempo increment preserves the duration of the final beat in the old measure', async () => {
  const app = createApp();
  app.run("startCueToggle.checked = false; changeCueToggle.checked = false; restEnableToggle.checked = false; stepMeasures.value = '1'; stepAmount.value = '10'");
  await app.run('start()');
  app.tick(2.7);
  assert.equal(Number(app.clicks[4].time.toFixed(2)), 2.05);
  assert.ok(Math.abs(app.clicks[5].time - app.clicks[4].time - 60 / 130) < 1e-9);
});

test('stopping during rest clears callbacks and restarting immediately plays', async () => {
  const app = createApp();
  app.run("startCueToggle.checked = false; changeCueToggle.checked = false; sigNumerator.value = '1'; stepMeasures.value = '1'; restIntervals.value = '1'; restSeconds.value = '10'");
  await app.run('start()');
  assert.equal(app.run('isResting'), true);
  app.tick(0.1);
  assert.equal(app.elements.get('infoBar').textContent, 'REST: 10s');
  app.run('stop()');
  assert.equal(app.run('isResting'), false);
  assert.equal(app.timers.size, 0);
  assert.match(app.elements.get('progressInfo').textContent, /STOPPED/);
  const count = app.clicks.length;
  app.run('intervalEnableToggle.checked = false');
  await app.run('start()');
  app.tick(1);
  assert.equal(app.run('isResting'), false);
  assert.ok(app.clicks.length > count);
  app.run('stop()');
  app.tick(20);
  assert.equal(app.timers.size, 0);
});

test('rest lasts from the measure boundary and resumes at the new tempo', async () => {
  const app = createApp();
  app.run("startCueToggle.checked = false; changeCueToggle.checked = false; sigNumerator.value = '1'; stepMeasures.value = '1'; restIntervals.value = '1'; restSeconds.value = '1'; targetBPM.value = '130'");
  await app.run('start()');
  app.tick(1.8);
  assert.equal(Number(app.clicks[1].time.toFixed(2)), 1.55);
  assert.equal(app.run('bpm'), 130);
  assert.equal(app.run('isResting'), false);
});

test('target speed does not count imaginary increments or repeatedly trigger rest', async () => {
  const app = createApp();
  app.run("startCueToggle.checked = false; sigNumerator.value = '1'; stepMeasures.value = '1'; targetBPM.value = '120'; restIntervals.value = '1'");
  await app.run('start()');
  app.tick(4);
  assert.equal(app.run('incrementCount'), 0);
  assert.equal(app.run('isResting'), false);
  assert.equal(app.run('bpm'), 120);
});

test('a lower target never decreases the configured starting tempo', async () => {
  const app = createApp();
  app.run("startCueToggle.checked = false; sigNumerator.value = '1'; stepMeasures.value = '1'; targetBPM.value = '60'");
  await app.run('start()');
  app.tick(2);
  assert.equal(app.run('bpm'), 120);
});

test('speech is optional and respects master volume', () => {
  const app = createApp();
  app.run("volume = 0; speak('One')");
  assert.equal(app.spoken.length, 0);
  app.run("volume = 50; speak('Two')");
  assert.equal(app.spoken[0].volume, 0.5);
  assert.doesNotThrow(() => createApp({ speech: false }).run("speak('One')"));
});

test('unavailable audio returns to a stopped state with an actionable message', async () => {
  const app = createApp({ audio: false });
  await app.run('start()');
  assert.equal(app.run('isPlaying'), false);
  assert.match(app.elements.get('infoBar').textContent, /AUDIO UNAVAILABLE/);
});

test('a stop during asynchronous audio resume cannot launch an old scheduler', async () => {
  const app = createApp();
  app.run("audioCtx = new window.AudioContext(); audioCtx.state = 'suspended'; audioCtx.resume = () => new Promise(resolve => { window.finishResume = resolve; })");
  const starting = app.run('start()');
  app.run('stop(); window.finishResume()');
  await starting;
  assert.equal(app.clicks.length, 0);
  assert.equal(app.timers.size, 0);
});
