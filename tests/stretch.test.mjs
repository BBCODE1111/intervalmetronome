import test from 'node:test';
import assert from 'node:assert/strict';
import { fitSpeech } from '../src/stretch.js';

// Estimate a pure tone by normalized autocorrelation, including sub-sample peak.
function frequency(pcm, sampleRate, expected) {
    const minLag = Math.floor(sampleRate / (expected * 1.3));
    const maxLag = Math.ceil(sampleRate / (expected * .7));
    const correlations = [];
    let best = minLag;
    const start = Math.floor(pcm.length * .1), end = Math.floor(pcm.length * .9) - maxLag;
    for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
        let dot = 0, aa = 0, bb = 0;
        for (let i = start; i < end; i++) {
            const a = pcm[i], b = pcm[i + lag];
            dot += a * b; aa += a * a; bb += b * b;
        }
        correlations[lag] = dot / Math.sqrt(aa * bb);
        if(lag >= minLag && lag <= maxLag && correlations[lag] > (correlations[best] || -Infinity)) best = lag;
    }
    const left = correlations[best-1], center = correlations[best], right = correlations[best+1];
    const correction = .5 * (left - right) / (left - 2 * center + right);
    return sampleRate / (best + correction);
}

test('comfortable tempos preserve the exact original waveform instead of slowing down the voice', () => {
    const pcm = Float32Array.from({length:1000},(_,i)=>Math.sin(i/10));
    assert.equal(fitSpeech(pcm,24000,.5),pcm);
    assert.equal(fitSpeech(pcm,24000,2),pcm);
});

test('compressing speech-length tones preserves pitch even at the 400 BPM /8 beat length', () => {
    for(const sampleRate of [24000,44100,48000]) for(const hz of [180,220,300]) {
        const pcm = Float32Array.from({length:Math.round(sampleRate * .5)},(_,i)=>.5*Math.sin(2*Math.PI*hz*i/sampleRate));
        for(const duration of [.425,.283,.212,.127,.075*.85]) {
            const output = fitSpeech(pcm,sampleRate,duration);
            assert.ok(output.length <= Math.floor(sampleRate * duration));
            assert.ok(output.every(Number.isFinite));
            const observed = frequency(output,sampleRate,hz);
            assert.ok(Math.abs(observed/hz - 1) < .02, `${sampleRate} Hz, ${duration}s: expected ${hz}, got ${observed}`);
        }
    }
});
