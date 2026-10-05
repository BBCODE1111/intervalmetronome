# Third-party notices

- Orbitron (bundled 400/700 Latin fonts): SIL Open Font License 1.1. Distributed by `@fontsource/orbitron` 5.3.0. The complete license is included in each website build under `licenses/Orbitron-OFL.txt`.
- Tailwind CSS 4.3.3: MIT license. Used at build time to generate static CSS. The complete license is included under `licenses/Tailwind-MIT.txt`.

- Extended numeric words (11 and above) and the short rest prompt: generated locally using Kokoro-82M v1.0, female preset `af_sarah`, via `kokoro-js` 1.2.1. Kokoro model and code: Apache-2.0 (https://github.com/hexgrad/kokoro and https://huggingface.co/hexgrad/Kokoro-82M). The ONNX model is from https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX. These are generated numeric words and brief prompts, not recordings of the user's system voice. Model and voice hashes are in `assets/audio/counts-v2.json`. The generator and its dependencies are development tools only and are not deployed.
- Recorded counts 1–10: Kenney Voiceover Pack, female voice by Giselle, CC0 1.0. Source: https://kenney.nl/assets/voiceover-pack. Original recordings and credits are in `scripts/recorded-voice/source/`; license is also distributed at `assets/audio/Kenney-CC0.txt`. Duration variants are prepared offline and encoded as AAC.
- OGG decoding during asset preparation: `@wasm-audio-decoders/ogg-vorbis` 0.1.20 (MIT), https://github.com/eshaz/wasm-audio-decoders. Development tool only; not shipped to the browser.
- SoundTouchJS core 2.1.1: Mozilla Public License 2.0, Copyright Olli Parviainen, Ryan Berdeen, Jakub Fiala and Steve 'Cutter' Blades. Used for WSOLA tempo changes with stable pitch. Full license: `licenses/SoundTouch-MPL-2.0.txt`. The deployed `assets/stretch.js.map` includes the corresponding unmodified library source. Upstream: https://github.com/cutterbl/SoundTouchJS/tree/master/packages/core.
- esbuild 0.25.12: MIT license; build-time JavaScript bundling only.

- Female voice comparison samples under `voice-preview/audio`: generated with `kokoro-js` 1.2.1 and the Apache-2.0 Kokoro-82M model (https://huggingface.co/hexgrad/Kokoro-82M). Voices: `af_heart`, `af_bella`, `af_sarah`. The samples contain the numbers one through eight at the same settings for each voice. Pitch-preserving duration adjustment was performed offline with `@soundtouchjs/core` 2.1.1. Only the generated WAV files are served; no model weights or speech engine are downloaded by the listener. Generation metadata is in `voice-preview/audio/manifest.json`.

The original application and Git history come from https://github.com/Alecliu/intervalmetronome. This release does not assign a new license to the application code.
