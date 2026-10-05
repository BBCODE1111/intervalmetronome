import { Stretch, CircularSampleBuffer } from '@soundtouchjs/core';

// Use ordinary typed arrays, including on browsers without resizable ArrayBuffer.
function makeReadAdapter() {
    let buffer, samples, position;
    return {
        setBuffer(value) {
            buffer = value;
            samples = new Float32Array(buffer.frameCount * 2);
            buffer.extract(samples);
            position = 0;
        },
        get frameCount() { return buffer.frameCount; },
        get startIndex() { return position * 2; },
        readSample(index) { return samples[index] || 0; },
        readSubarray(start, end) { return samples.subarray(start, end); },
        receive(frames) { const used = Math.min(frames, buffer.frameCount); buffer.receive(used); position += used; },
        receiveSamples(destination, frames) {
            destination.set(samples.subarray(position * 2, (position + frames) * 2));
            this.receive(frames);
        },
    };
}

// Prepare a short spoken cue BEFORE scheduling it. WSOLA shortens the speech
// without resampling its pitch; the AudioBufferSource always plays at rate 1.
export function fitSpeech(pcm, sampleRate, maxSeconds) {
    const target = Math.max(1, Math.floor(sampleRate * maxSeconds));
    if (pcm.length <= target) return pcm;
    let tempo = pcm.length / target;
    let result;
    for (let attempt = 0; attempt < 5; attempt++) {
        const stretch = new Stretch({
            sampleRate, createBuffers: true,
            inputBufferAdapterFactory: makeReadAdapter,
            sampleBufferFactory: () => new CircularSampleBuffer(),
        });
        stretch.setStretchParameters({ sequenceMs: 25, seekWindowMs: 10, overlapMs: 5, quickSeek: true });
        stretch.tempo = tempo;
        // Flush the final phoneme through the windowed processor with silence.
        const input = new Float32Array((pcm.length + Math.ceil(sampleRate * 0.1 * tempo)) * 2);
        for (let i = 0; i < pcm.length; i++) input[i * 2] = input[i * 2 + 1] = pcm[i];
        stretch.inputBuffer.putSamples(input);
        stretch.process();
        const stereo = new Float32Array(stretch.outputBuffer.frameCount * 2);
        stretch.outputBuffer.extract(stereo);
        let start = 0, end = stereo.length / 2;
        while (start < end && Math.abs(stereo[start * 2]) < 0.0001) start++;
        while (end > start && Math.abs(stereo[(end - 1) * 2]) < 0.0001) end--;
        result = new Float32Array(end - start);
        for (let i = start; i < end; i++) result[i - start] = stereo[i * 2];
        if (result.length <= target) break;
        tempo *= result.length / target * 1.02;
    }
    if (!result.length) throw new Error('Time stretching produced silent speech');
    // Timing windows have a minimum useful length. Never pitch-shift to make
    // them fit: retain only whole processed frames and fade the final millisecond.
    if (result.length > target) result = result.slice(0, target);
    const fade = Math.min(Math.round(sampleRate * 0.001), Math.floor(result.length / 4));
    for (let i = 0; i < fade; i++) {
        result[i] *= (i + 1) / fade;
        result[result.length - 1 - i] *= (i + 1) / fade;
    }
    return result;
}
