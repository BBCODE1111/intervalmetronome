// Clicks and recorded count-in share one AudioContext and one sample clock.
// Native speech synthesis has an independent queue and cannot schedule a beat.
(() => {
    const units = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
        'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const scales = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'];

    function numberWords(number) {
        if (!Number.isSafeInteger(number) || number < 0) throw new RangeError('Expected a nonnegative safe integer');
        if (number === 0) return ['zero'];
        const words = [];
        for (let scale = 0; number > 0; scale++, number = Math.floor(number / 1000)) {
            let group = number % 1000;
            if (!group) continue;
            const part = [];
            if (group >= 100) { part.push(units[Math.floor(group / 100)], 'hundred'); group %= 100; }
            if (group >= 20) { part.push(tens[Math.floor(group / 10)]); group %= 10; }
            if (group) part.push(units[group]);
            if (scales[scale]) part.push(scales[scale]);
            words.unshift(...part);
        }
        return words;
    }

    class Engine {
        constructor(context) {
            this.context = context;
            this.master = context.createGain();
            this.master.connect(context.destination);
            this.active = new Set();
            this.cache = new Map();
        }

        setVolume(value) { this.master.gain.value = Math.max(0, Math.min(1, value)); }

        async ready() {
            if (!this.loading) {
                this.loading = this.load().catch(error => { this.loading = null; throw error; });
            }
            return this.loading;
        }

        async load() {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            try {
                const [manifestResponse, waveResponse] = await Promise.all([
                    fetch('./assets/audio/counts-v1.json', { signal: controller.signal }),
                    fetch('./assets/audio/counts-v1.wav', { signal: controller.signal }),
                ]);
                if (!manifestResponse.ok || !waveResponse.ok) throw new Error('Voice download failed');
                const [manifest, data] = await Promise.all([manifestResponse.json(), waveResponse.arrayBuffer()]);
                // Explicit sample rate keeps sprite offsets correct if the device
                // decodes 22.05 kHz WAV to 44.1 or 48 kHz audio.
                const bank = await this.context.decodeAudioData(data);
                const clips = {};
                for (const [word, range] of Object.entries(manifest.clips)) {
                    const begin = Math.round(range.offset * bank.sampleRate / manifest.sampleRate);
                    const requestedEnd = Math.round((range.offset + range.length) * bank.sampleRate / manifest.sampleRate);
                    // Browsers may floor the decoded bank's final resampled frame.
                    const end = Math.min(bank.length, requestedEnd);
                    if (!Number.isFinite(begin) || !Number.isFinite(requestedEnd) || begin < 0 || requestedEnd > bank.length + 1 || end <= begin) throw new Error('Invalid voice bank');
                    clips[word] = bank.getChannelData(0).slice(begin, end);
                }
                for (const word of [...units, ...tens.filter(Boolean), ...scales.filter(Boolean), 'hundred', 'rest', 'next', 'speed']) {
                    if (!clips[word]?.length) throw new Error(`Missing voice: ${word}`);
                }
                this.sampleRate = bank.sampleRate;
                this.clips = clips;
            } finally { clearTimeout(timeout); controller.abort(); }
        }

        bufferFor(words) {
            if (!this.clips) throw new Error('Voice is not ready');
            const key = words.join(' ');
            if (this.cache.has(key)) return this.cache.get(key);
            const gap = Math.round(this.sampleRate * 0.008);
            const length = words.reduce((sum, word) => sum + this.clips[word].length, 0) + gap * (words.length - 1);
            const buffer = this.context.createBuffer(1, length, this.sampleRate);
            const pcm = buffer.getChannelData(0);
            let offset = 0;
            for (const word of words) { pcm.set(this.clips[word], offset); offset += this.clips[word].length + gap; }
            // An arbitrary meter must never allocate audio for all its beats.
            if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value);
            this.cache.set(key, buffer);
            return buffer;
        }

        track(source, nodes = []) {
            this.active.add(source);
            source.onended = () => {
                this.active.delete(source);
                source.disconnect();
                for (const node of nodes) node.disconnect();
            };
        }

        voice(words, time, duration, naturalRate = 1) {
            const buffer = this.bufferFor(words);
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            // Finish every whole number within this beat, including compound
            // numbers, /8, and the fastest supported tempo. Never queue speech.
            source.playbackRate.value = Math.max(0.8, naturalRate, buffer.duration / (duration * 0.85));
            source.connect(this.master);
            this.track(source);
            source.start(time);
            return source;
        }

        count(number, time, beatDuration) {
            return this.voice(numberWords(number), time, beatDuration, 0.5 / beatDuration);
        }

        rest(bpm, time, duration) {
            return this.voice(['rest', 'next', 'speed', ...numberWords(bpm)], time, duration);
        }

        click(time, strong, withVoice = false) {
            const osc = this.context.createOscillator();
            const envelope = this.context.createGain();
            osc.frequency.setValueAtTime(strong ? 1600 : 900, time);
            osc.type = 'triangle';
            envelope.gain.setValueAtTime(withVoice ? 0.18 : 0.4, time);
            envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
            osc.connect(envelope);
            envelope.connect(this.master);
            this.track(osc, [envelope]);
            osc.start(time);
            osc.stop(time + 0.05);
            return osc;
        }

        stop() {
            for (const source of this.active) { source.stop(); source.disconnect(); }
            this.active.clear();
        }
    }
    globalThis.MetronomeAudio = { Engine, numberWords };
})();
