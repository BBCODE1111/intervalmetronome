// Clicks and recorded count-in share one AudioContext and one sample clock.
// Native speech synthesis has an independent queue and cannot schedule a beat.
(() => {
    // Give the retained consonant a short lead-in so the body of the number
    // reaches the click. Fixed lead preserves count spacing across BPM changes.
    const countLeadSeconds = .02;
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

    // Common count-ins are bundled with the page and decoded before START.
    let recorded, recordedLoading, extraLoading, extraReady = false;
    function decoderFor(context) {
        const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        return Offline ? new Offline(1, 1, MetronomeVoiceData.sampleRate) : context;
    }
    function readVariants(bank, manifest) {
        const ratio = bank.sampleRate / MetronomeVoiceData.sampleRate, clips = {};
        const {max, abs} = Math;
        for (const [word, variants] of Object.entries(manifest)) {
            clips[word] = variants.map(({offset, length}) => {
                const start = Math.round(offset * ratio);
                const end = Math.min(bank.length, Math.round((offset + length) * ratio));
                const pcm = bank.getChannelData(0).slice(start, end);
                const peak = pcm.reduce((m, sample) => max(m, abs(sample)), 0);
                const first = pcm.findIndex(sample => abs(sample) > peak * .004);
                if (first < 0) throw new Error('Silent recorded voice');
                const trimmed = pcm.slice(first);
                const fade = Math.min(Math.round(bank.sampleRate * .001), trimmed.length);
                for (let i = 0; i < fade; i++) trimmed[i] *= (i + 1) / fade;
                return trimmed;
            });
        }
        return clips;
    }
    function preload(context) {
        if (recordedLoading) return recordedLoading;
        const decoder = decoderFor(context);
        if (!decoder) return Promise.resolve();
        recordedLoading = (async () => {
            const bytes = Uint8Array.from(atob(MetronomeVoiceData.encoded), char => char.charCodeAt(0));
            const bank = await decoder.decodeAudioData(bytes.buffer);
            recorded = {clips:readVariants(bank, MetronomeVoiceData.clips), sampleRate:bank.sampleRate};
        })().catch(error => { recordedLoading = null; throw error; });
        return recordedLoading;
    }
    function preloadExtra(context) {
        if (extraLoading) return extraLoading;
        const decoder = decoderFor(context);
        if (!decoder) return Promise.resolve();
        extraLoading = (async () => {
            await preload(context);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            try {
                const response = await fetch(MetronomeVoiceData.extra.src, {signal:controller.signal});
                if (!response.ok) throw new Error('Extra counts unavailable');
                const bank = await decoder.decodeAudioData(await response.arrayBuffer());
                Object.assign(recorded.clips, readVariants(bank, MetronomeVoiceData.extra.clips));
                extraReady = true;
            } finally { clearTimeout(timeout); controller.abort(); }
        })().catch(error => { extraLoading = null; throw error; });
        return extraLoading;
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

        async ready(count = 4) {
            await preload(this.context);
            await Promise.all([
                count > 4 ? preloadExtra(this.context) : undefined,
                count > 10 ? this.loadExtended() : undefined,
            ]);
        }

        hasCounts(count) { return !!recorded && (count <= 4 || extraReady) && (count <= 10 || !!this.clips); }

        async loadExtended() {
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
                    fetch('./assets/audio/counts-v2.json', { signal: controller.signal }),
                    fetch('./assets/audio/counts-extended-v3.m4a', { signal: controller.signal }),
                ]);
                if (!manifestResponse.ok || !waveResponse.ok) throw new Error('Voice download failed');
                const [manifest, data] = await Promise.all([manifestResponse.json(), waveResponse.arrayBuffer()]);
                // Explicit sample rate keeps sprite offsets correct if the device
                // resamples the voice WAV to 44.1 or 48 kHz audio.
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

        bufferFor(words, maxSeconds = Infinity) {
            const key = `${words.join(' ')}:${maxSeconds}`;
            if (this.cache.has(key)) return this.cache.get(key);
            if (words.length === 1 && recorded?.clips[words[0]]) {
                const variants = recorded.clips[words[0]];
                const pcm = variants.find(samples => samples.length / recorded.sampleRate <= maxSeconds) || variants[variants.length - 1];
                const buffer = this.context.createBuffer(1, pcm.length, recorded.sampleRate);
                buffer.getChannelData(0).set(pcm);
                if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value);
                this.cache.set(key, buffer);
                return buffer;
            }
            if (!this.clips) throw new Error('Extended voice is not ready');
            const gap = Math.round(this.sampleRate * 0.008);
            const length = words.reduce((sum, word) => sum + this.clips[word].length, 0) + gap * (words.length - 1);
            const original = new Float32Array(length);
            let offset = 0;
            for (const word of words) { original.set(this.clips[word], offset); offset += this.clips[word].length + gap; }
            const pcm = MetronomeStretch.fitSpeech(original, this.sampleRate, maxSeconds);
            const buffer = this.context.createBuffer(1, pcm.length, this.sampleRate);
            buffer.getChannelData(0).set(pcm);
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

        voice(words, time, duration) {
            const buffer = this.bufferFor(words, duration * 0.985);
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            // Keep the speaker's original pitch. Timing changes are rendered
            // into the buffer in advance; playback never speeds up the waveform.
            source.playbackRate.value = 1;
            source.connect(this.master);
            this.track(source);
            source.start(time);
            return source;
        }

        count(number, time, beatDuration) {
            return this.voice(numberWords(number), time - countLeadSeconds, beatDuration);
        }

        prepareCounts(beats, beatDuration) {
            // Prime common count-ins before starting the clock, bounding work
            // for arbitrary meters. Longer counts are cached on demand.
            for (let count = 1; count <= Math.min(beats, 16); count++) {
                this.bufferFor(numberWords(count), beatDuration * 0.985);
            }
        }

        rest(bpm, time, duration) {
            return this.voice(['rest'], time, duration);
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
    globalThis.MetronomeAudio = { Engine, numberWords, preload, preloadExtra, countLeadSeconds };
    preload().then(() => preloadExtra()).catch(() => {});
    // Failed optional background loads never prevent the bundled 1–4 count-in.
})();
