# Third-party notices

- Orbitron (bundled 400/700 Latin fonts): SIL Open Font License 1.1. Distributed by `@fontsource/orbitron` 5.3.0. The complete license is included in each website build under `licenses/Orbitron-OFL.txt`.
- Tailwind CSS 4.3.3: MIT license. Used at build time to generate static CSS. The complete license is included under `licenses/Tailwind-MIT.txt`.

- Count and rest voice assets: generated locally from numeric words and short prompts using `espeak-ng` 1.0.2 (https://github.com/ianmarmour/espeak-ng.js), an eSpeak NG WebAssembly build under GPL-3.0-or-later. The engine is a development dependency only and is not included in the deployed website. The generated audio contains no third-party text, recordings or voice clones. The generation script and parameters are included in the source package. eSpeak output policy: https://espeak.sourceforge.net/license.html.

- Female voice comparison samples under `voice-preview/audio`: generated with `kokoro-js` 1.2.1 and the Apache-2.0 Kokoro-82M model (https://huggingface.co/hexgrad/Kokoro-82M). Voices: `af_heart`, `af_bella`, `af_sarah`. The samples contain the numbers one through eight at the same settings for each voice. Pitch-preserving duration adjustment was performed offline with `@soundtouchjs/core` 2.1.1. Only the generated WAV files are served; no model weights or speech engine are downloaded by the listener. Generation metadata is in `voice-preview/audio/manifest.json`.

The original application and Git history come from https://github.com/Alecliu/intervalmetronome. This release does not assign a new license to the application code.
