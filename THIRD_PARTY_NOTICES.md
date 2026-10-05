# Third-party notices

- Orbitron (bundled 400/700 Latin fonts): SIL Open Font License 1.1. Distributed by `@fontsource/orbitron` 5.3.0. The complete license is included in each website build under `licenses/Orbitron-OFL.txt`.
- Tailwind CSS 4.3.3: MIT license. Used at build time to generate static CSS. The complete license is included under `licenses/Tailwind-MIT.txt`.

- Count and rest voice assets: generated locally using Kokoro-82M v1.0, female preset `af_heart`, via `kokoro-js` 1.2.1. Kokoro model and code: Apache-2.0 (https://github.com/hexgrad/kokoro and https://huggingface.co/hexgrad/Kokoro-82M). The ONNX model is from https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX. These are generated numeric words and brief prompts, not recordings of the user's system voice. Model and voice hashes are in `assets/audio/counts-v2.json`. The generator and its dependencies are development tools only and are not deployed.
- SoundTouchJS core 2.1.1: Mozilla Public License 2.0, Copyright Olli Parviainen, Ryan Berdeen, Jakub Fiala and Steve 'Cutter' Blades. Used for WSOLA tempo changes with stable pitch. Full license: `licenses/SoundTouch-MPL-2.0.txt`. The deployed `assets/stretch.js.map` includes the corresponding unmodified library source. Upstream: https://github.com/cutterbl/SoundTouchJS/tree/master/packages/core.
- esbuild 0.25.12: MIT license; build-time JavaScript bundling only.

The original application and Git history come from https://github.com/Alecliu/intervalmetronome. This release does not assign a new license to the application code.
