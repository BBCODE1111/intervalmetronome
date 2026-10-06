// Asset preparation only; no speech analysis runs while the metronome plays.
// A low-level /f/, /s/ or aspiration can precede the body of a number by 200 ms.
// Detect a sustained rise in both low-band and full-band envelopes, rather than
// the first nonzero sample. This is an acoustic aid, not a perceptual guarantee.
export function speechBodyFrame(pcm, sampleRate) {
    const hop = Math.max(1, Math.round(sampleRate * .005));
    const alpha = 1 - Math.exp(-2 * Math.PI * 1000 / sampleRate);
    const envelope = [], fullEnvelope = [];
    let filtered = 0, sum = 0, fullSum = 0, peak = 0, fullPeak = 0;
    for (let i = 0; i < pcm.length; i++) {
        filtered += alpha * (pcm[i] - filtered);
        sum += filtered * filtered;
        fullSum += pcm[i] * pcm[i];
        if ((i + 1) % hop === 0) {
            const rms = Math.sqrt(sum / hop);
            envelope.push(rms);
            peak = Math.max(peak, rms);
            const fullRms = Math.sqrt(fullSum / hop);
            fullEnvelope.push(fullRms);
            fullPeak = Math.max(fullPeak, fullRms);
            sum = fullSum = 0;
        }
    }
    if (!peak) throw new Error('Silent voice sample');
    function rise(values, maximum) {
        for (let i = 0; i < values.length - 2; i++) {
            if (values.slice(i, i + 3).every(value => value >= maximum * .3)) return i * hop;
        }
        // Very short fast-tempo variants may not have three complete windows.
        return values.findIndex(value => value >= maximum * .3) * hop;
    }
    // Require the low band and the full signal to have reached their body.
    // This avoids a loud /s/ or a very quiet voiced /w/ being mistaken for it.
    return Math.max(rise(envelope, peak), rise(fullEnvelope, fullPeak));
}

export function prepareAttack(pcm, sampleRate, {word = '', maxLeadSeconds = .025} = {}) {
    const body = speechBodyFrame(pcm, sampleRate);
    const keep = Math.round(maxLeadSeconds * sampleRate);
    if (body <= keep) return {pcm, removedFrames:0, bodyFrame:body};

    let output;
    if (word === 'two' || word === 'ten') {
        // Keep the initial /t/ burst as well as the transition into the vowel;
        // removing the entire prefix would turn "two" into "oo".
        const hop = Math.max(1, Math.round(sampleRate * .002));
        const levels = [];
        for (let i = 0; i + hop <= body; i += hop) {
            let sum = 0;
            for (let j = i; j < i + hop; j++) sum += pcm[j] * pcm[j];
            levels.push(Math.sqrt(sum / hop));
        }
        const threshold = Math.max(...levels) * .25;
        const burst = Math.max(0, levels.findIndex(value => value >= threshold)) * hop;
        const cross = Math.min(Math.round(sampleRate * .003), Math.floor(keep / 4));
        const head = Math.floor((keep + cross) / 2);
        const tail = keep + cross - head;
        output = new Float32Array(keep + pcm.length - body);
        output.set(pcm.subarray(burst, burst + head));
        const tailStart = body - tail;
        const join = head - cross;
        for (let i = 0; i < cross; i++) {
            const mix = (i + 1) / (cross + 1);
            output[join + i] = output[join + i] * (1 - mix) + pcm[tailStart + i] * mix;
        }
        output.set(pcm.subarray(tailStart + cross), head);
    } else {
        // Retain a short, original-pitch /w/, /th/, /f/, /s/ or /n/ articulation.
        output = pcm.slice(body - keep);
    }
    const fade = Math.min(Math.round(sampleRate * .001), output.length);
    for (let i = 0; i < fade; i++) output[i] *= (i + 1) / fade;
    return {pcm:output, removedFrames:pcm.length - output.length, bodyFrame:speechBodyFrame(output, sampleRate)};
}
