# Changelog

## 1.2.0

- Replace the eSpeak voice with the selected C preview voice, Kokoro Sarah. The original browser version did not identify a particular system voice, so this release does not claim an exact match to that voice.
- Keep `AudioBufferSourceNode.playbackRate` at 1 at every BPM. Leave cues unchanged when they fit; otherwise render pitch-preserving WSOLA time compression before scheduling. Slow tempos no longer stretch the voice down in pitch.
- Prepare the common startup counts before scheduling the first beat. Keep shared audio-clock synchronization, custom integer meters and the default 4/4.
- Add pure-tone pitch regression tests at 24/44.1/48 kHz down to the 400 BPM /8 cue window, plus checks that uncompressed speech is bit-identical to its source. All 20 tests pass.
- Browser verification of Sarah across 36 renders / 360 spoken beats: maximum voice/click signal-onset difference 0.454 ms; no cross-beat overlap. First 120 BPM /4 start and repeat 400 BPM 7/8 start both produced all expected spoken counts. Very short windows can still reduce speech intelligibility, without the former pitch increase.

## 1.1.0

- Replace browser speech synthesis with bundled, silence-trimmed voice samples. Spoken counts and clicks now start on the same Web Audio timestamp; each complete number fits within its beat at the current tempo.
- Wait for successful voice download/decode before the first beat. Cancelled starts cannot launch stale schedulers, failed loads can be retried, and stopping cancels both clicks and voice.
- Keep the initial 4/4 meter. Beats / MSR remains direct numeric entry, accepts positive safe integers without the previous 16-beat cap, and rejects decimals instead of truncating them. Apply live meter edits at a complete measure/count-in boundary.
- Assemble compound numbers on demand using a bounded cache; include rest announcements and one shared volume control.
- Handle 44.1/48 kHz resampling boundaries and late scheduler callbacks without a burst of missed beats.
- Add reproducible voice generation and local browser QA pages. Browser waveform validation: 36 renders / 360 spoken beats, maximum measured voice/click signal-onset difference 0.046 ms, no cross-beat voice overlap, and silent output after mute/stop. Real-time analyser checks cover cold and repeat starts. These measurements do not certify acoustic output on every device.

## 1.0.1

- Restore the original uninterrupted speech queue during count-in. Version 1.0.0 called `speechSynthesis.cancel()` before every number; cancellation now occurs only when stopping playback.
- Preserve the original cue lead time (30 ms) and speech-rate formula.
- Add regression coverage for startup count-in at every integer BPM from 30 through 400 in quarter- and eighth-note signatures (742 combinations), and for count-in after a tempo increment. Check all four spoken-number requests against their corresponding beat times and preserve the original speech-rate formula.
- Version the JavaScript URL so reloading the page fetches the corrected file.

The automated checks verify scheduling and queue operations, not the acoustic timing of every device's speech engine.

## 1.0.0

- Package the original application, Git history, self-hosted styles/fonts, tests and GitHub Pages deployment.
