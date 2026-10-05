# Changelog

## 1.0.1

- Restore the original uninterrupted speech queue during count-in. Version 1.0.0 called `speechSynthesis.cancel()` before every number; cancellation now occurs only when stopping playback.
- Preserve the original cue lead time (30 ms) and speech-rate formula.
- Add regression coverage for startup count-in at every integer BPM from 30 through 400 in quarter- and eighth-note signatures (742 combinations), and for count-in after a tempo increment. Check all four spoken-number requests against their corresponding beat times and preserve the original speech-rate formula.
- Version the JavaScript URL so reloading the page fetches the corrected file.

The automated checks verify scheduling and queue operations, not the acoustic timing of every device's speech engine.

## 1.0.0

- Package the original application, Git history, self-hosted styles/fonts, tests and GitHub Pages deployment.
