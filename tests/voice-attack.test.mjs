import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareAttack, speechBodyFrame} from '../scripts/recorded-voice/attack.mjs';

test('every prepared count has meaningful energy within 30 ms, not just a noise spike', () => {
    const manifest = JSON.parse(readFileSync(new URL('../public/audio/counts-natural-v4.json', import.meta.url)));
    for (const [file, clips] of [
        ['counts-natural-v4', manifest.clips], ['counts-natural-extra-v4', manifest.extra.clips],
    ]) {
        const wave = readFileSync(new URL(`./fixtures/${file}.wav`, import.meta.url));
        for (const [word, variants] of Object.entries(clips)) for (const {offset, length} of variants) {
            if (word === 'rest') continue;
            const rms = [];
            for (let frame = 0; frame + 120 <= length; frame += 120) {
                let power = 0;
                for (let i = 0; i < 120; i++) power += (wave.readInt16LE(44 + (offset + frame + i) * 2) / 32768) ** 2;
                rms.push(Math.sqrt(power / 120));
            }
            const threshold = Math.max(...rms) * .3;
            const audible = rms.findIndex((value, i) => value >= threshold && rms[i + 1] >= threshold);
            assert.ok(audible >= 0 && audible * 5 <= 30, `${word}: strong attack at ${audible * 5} ms`);
        }
    }
});

test('shortening a breathy lead leaves the vowel waveform and pitch unchanged', () => {
    const rate = 24000;
    const pcm = Float32Array.from({length:rate / 2}, (_, i) =>
        (i < rate * .15 ? .002 : .6) * Math.sin(2 * Math.PI * 220 * i / rate));
    const body = speechBodyFrame(pcm, rate);
    const prepared = prepareAttack(pcm, rate, {word:'four'});
    assert.ok(prepared.removedFrames >= rate * .1);
    assert.ok(prepared.bodyFrame / rate <= .03);
    const vowel = pcm.slice(body);
    assert.deepEqual(prepared.pcm.slice(-vowel.length), vowel);
});

test('two and ten retain their initial stop burst as well as their vowel', () => {
    const rate = 24000;
    const pcm = Float32Array.from({length:rate / 2}, (_, i) => {
        const t = i / rate;
        const amplitude = t >= .02 && t < .03 ? .9 : t >= .15 ? .5 : .002;
        const hz = t < .15 ? 4000 : 220;
        return amplitude * Math.sin(2 * Math.PI * hz * t);
    });
    for (const word of ['two', 'ten']) {
        const prepared = prepareAttack(pcm, rate, {word});
        assert.ok(prepared.pcm.slice(0, rate * .015).some(value => Math.abs(value) > .7));
        const vowel = pcm.slice(speechBodyFrame(pcm, rate));
        assert.deepEqual(prepared.pcm.slice(-vowel.length), vowel);
        assert.ok(prepared.pcm.length < pcm.length - rate * .1);
    }
});
