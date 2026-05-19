# Changelog

## [0.3.3](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.3.2...v0.3.3) (2026-05-19)


### Bug Fixes

* **build:** enable ad-hoc signing for macOS arm64 builds ([6d135a7](https://github.com/Anthoooooooony/whoosh-electron/commit/6d135a7ebfedb61fa4c726271ee28acb01801d47))
* **build:** enable ad-hoc signing for macOS arm64 builds ([79f9c4f](https://github.com/Anthoooooooony/whoosh-electron/commit/79f9c4f22a6fa943895a2a53705c9338ad22a828))

## [0.3.2](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.3.1...v0.3.2) (2026-05-19)


### Bug Fixes

* **ci:** expand check matrix to macOS and Windows runners ([5aa72ee](https://github.com/Anthoooooooony/whoosh-electron/commit/5aa72eef47fc28626bc975c3d1013dc9de8170b3))
* **ci:** 扩展 check job 到 macOS 和 Windows matrix 以在 PR 阶段暴露平台特定问题 ([0f35660](https://github.com/Anthoooooooony/whoosh-electron/commit/0f35660e5fc74e7ccd76d1a4913d3587ef2d158a))
* **test:** add vitest coverage baseline via v8 provider ([3713ffc](https://github.com/Anthoooooooony/whoosh-electron/commit/3713ffc28badb2722b9cdbdb01f9b0c2e5b3de7c))
* **test:** add vitest coverage baseline via v8 provider ([050d27c](https://github.com/Anthoooooooony/whoosh-electron/commit/050d27c272eba77557e1ce2948a59f4cdafd782f))
* **test:** scaffold renderer test infra with smoke tests ([d291b36](https://github.com/Anthoooooooony/whoosh-electron/commit/d291b3695d8d180957e7918f3eae52eb6841ce3a))
* **test:** scaffold renderer test infra with smoke tests ([a4ce30a](https://github.com/Anthoooooooony/whoosh-electron/commit/a4ce30a31ccdb9d7c53fbfa7306b4f6cc72f2ae4))
* **ui:** split safeStorage error message by reason ([#69](https://github.com/Anthoooooooony/whoosh-electron/issues/69)) ([0ee6292](https://github.com/Anthoooooooony/whoosh-electron/commit/0ee629211d10d5a017177a7fe1c34bd3c26c1f1a))
* **ui:** split safeStorage error message by reason ([#69](https://github.com/Anthoooooooony/whoosh-electron/issues/69)) ([4ce8c92](https://github.com/Anthoooooooony/whoosh-electron/commit/4ce8c92d9e9bae2f5476157cd507dc9e2fbfb682))

## [0.3.1](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.3.0...v0.3.1) (2026-05-19)


### Bug Fixes

* **hotkey:** document uIOhook single-process register constraint ([#63](https://github.com/Anthoooooooony/whoosh-electron/issues/63)) ([31838c2](https://github.com/Anthoooooooony/whoosh-electron/commit/31838c216a73ab78a7e1685a23e9225cc1ef7a3f))
* **housekeeping:** cross-platform polish + lint strictness + Round 2 follow-ups ([#63](https://github.com/Anthoooooooony/whoosh-electron/issues/63)) ([a46bd26](https://github.com/Anthoooooooony/whoosh-electron/commit/a46bd2685fe9f17a34575ce8108387818bef9b5d))
* **lint:** elevate no-explicit-any to error and clean violations ([#63](https://github.com/Anthoooooooony/whoosh-electron/issues/63)) ([ae774d8](https://github.com/Anthoooooooony/whoosh-electron/commit/ae774d876002cf5e413cc0d3b6f54472fd935005))
* **logging:** use t() in LogsPane and skip zod parse on hot path ([#62](https://github.com/Anthoooooooony/whoosh-electron/issues/62)) ([327bfea](https://github.com/Anthoooooooony/whoosh-electron/commit/327bfea9047b8a9c98705d2b1420ca2ef297a265))
* **logging:** wire verbose toggle to gate transcript debug logs ([#62](https://github.com/Anthoooooooony/whoosh-electron/issues/62)) ([ecfa322](https://github.com/Anthoooooooony/whoosh-electron/commit/ecfa3220b11c9cd505b2ab4998d7d2e60130e40c))
* **logging:** wire verbose toggle to gate transcript debug logs ([#62](https://github.com/Anthoooooooony/whoosh-electron/issues/62)) ([e7cea03](https://github.com/Anthoooooooony/whoosh-electron/commit/e7cea030bc291c7784955aad758a29e675e57ff2))
* **native:** align Windows clipboard restore delay with macOS ([#63](https://github.com/Anthoooooooony/whoosh-electron/issues/63)) ([690a644](https://github.com/Anthoooooooony/whoosh-electron/commit/690a644fb800560343256fe54c27de043b99f117))
* **platform:** narrow Platform type to darwin | win32 ([#63](https://github.com/Anthoooooooony/whoosh-electron/issues/63)) ([44b4dcb](https://github.com/Anthoooooooony/whoosh-electron/commit/44b4dcbaf0e0781ce5afcae5993fde4aa1ca8853))
* **provider:** apply backpressure on doubao ws pushAudio ([#61](https://github.com/Anthoooooooony/whoosh-electron/issues/61)) ([5de7d7c](https://github.com/Anthoooooooony/whoosh-electron/commit/5de7d7cde3cd8393f0527409c1ffab9cd5392c48))
* **provider:** apply backpressure on doubao ws pushAudio ([#61](https://github.com/Anthoooooooony/whoosh-electron/issues/61)) ([d5c8e60](https://github.com/Anthoooooooony/whoosh-electron/commit/d5c8e601a9b0315dfcd98965427096c1d3b8f58c))
* **provider:** split finish() errors and clarify backpressure comments ([#63](https://github.com/Anthoooooooony/whoosh-electron/issues/63)) ([09f045f](https://github.com/Anthoooooooony/whoosh-electron/commit/09f045f292877560de2df1cb0575ae6b6a59c0db))
* **session:** add coverage for pasting stale capture-ended and AudioCaptureEndedSchema ([#60](https://github.com/Anthoooooooony/whoosh-electron/issues/60)) ([45ad430](https://github.com/Anthoooooooony/whoosh-electron/commit/45ad43083cd2598ac6c97c2c7b0e8f3394bdc5d1))
* **session:** surface errors instead of silently dropping at paste and mic-lost ([#60](https://github.com/Anthoooooooony/whoosh-electron/issues/60)) ([a54f41d](https://github.com/Anthoooooooony/whoosh-electron/commit/a54f41d78a572ac063498cfde02fdb78a1d93b4d))
* **session:** surface errors instead of silently dropping at paste and mic-lost ([#60](https://github.com/Anthoooooooony/whoosh-electron/issues/60)) ([93d3712](https://github.com/Anthoooooooony/whoosh-electron/commit/93d3712275d23a8100b92796fd525f6e6247e45a))
* **store:** handle encryptString throw in setApiKey ([#63](https://github.com/Anthoooooooony/whoosh-electron/issues/63)) ([4265d7b](https://github.com/Anthoooooooony/whoosh-electron/commit/4265d7b5f5003bbdbb2a4ed4bb2667aa466e0ec9))
* **ui:** align onboarding setTestMsg ordering and annotate Sequoia URL drift ([#63](https://github.com/Anthoooooooony/whoosh-electron/issues/63)) ([6b65fc5](https://github.com/Anthoooooooony/whoosh-electron/commit/6b65fc508a29e871578946300f39b1bd8bcd8c8f))

## [0.3.0](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.2.8...v0.3.0) (2026-05-19)


### Features

* **providers:** centralize provider routing via registry ([#53](https://github.com/Anthoooooooony/whoosh-electron/issues/53)) ([ccce3ff](https://github.com/Anthoooooooony/whoosh-electron/commit/ccce3ff67f33f9948704ad316f23fb7e2738e82a))
* **providers:** centralize provider routing via registry ([#53](https://github.com/Anthoooooooony/whoosh-electron/issues/53)) ([2247271](https://github.com/Anthoooooooony/whoosh-electron/commit/22472715047ccc80866f2b3d01beff31e0fa988d))


### Bug Fixes

* **ci:** wire tag input to softprops and dispatch CI on release PR updates ([b736e96](https://github.com/Anthoooooooony/whoosh-electron/commit/b736e96810b7d4c48bd8cb6d123da6752290461a))
* **ci:** wire tag input to softprops and dispatch CI on release PR updates ([#52](https://github.com/Anthoooooooony/whoosh-electron/issues/52)) ([37c7894](https://github.com/Anthoooooooony/whoosh-electron/commit/37c7894c8cd2ce85a4223b22e097440217fa5ce9))
* **i18n:** use t() for safeStorage unavailable message ([#51](https://github.com/Anthoooooooony/whoosh-electron/issues/51)) ([a484583](https://github.com/Anthoooooooony/whoosh-electron/commit/a484583e1b6b778c6bbac5bea8c346feb6831cec))
* **provider:** finish() throws when session not streaming ([#50](https://github.com/Anthoooooooony/whoosh-electron/issues/50)) ([a6c8c9f](https://github.com/Anthoooooooony/whoosh-electron/commit/a6c8c9f942e14f52610f2d9c6f1928fd63bc5fb9))
* **provider:** finish() throws when session not streaming ([#50](https://github.com/Anthoooooooony/whoosh-electron/issues/50)) ([2fda1c9](https://github.com/Anthoooooooony/whoosh-electron/commit/2fda1c983845e58b63daa92d2bd57589828cfe11))
* **providers:** restore .env fallback and HUD error key reset ([#53](https://github.com/Anthoooooooony/whoosh-electron/issues/53)) ([edd833a](https://github.com/Anthoooooooony/whoosh-electron/commit/edd833ad6d029f97772a6632cc4292d216d0b5a2))
* **store:** refuse plaintext apikey fallback and auto-migrate ([#51](https://github.com/Anthoooooooony/whoosh-electron/issues/51)) ([bb4ac6e](https://github.com/Anthoooooooony/whoosh-electron/commit/bb4ac6ef57fa53d13bca8eff2a5c2872a82744b0))
* **store:** refuse plaintext apikey fallback and auto-migrate ([#51](https://github.com/Anthoooooooony/whoosh-electron/issues/51)) ([c7c3891](https://github.com/Anthoooooooony/whoosh-electron/commit/c7c3891ada30e757e49a876fc2e83d30c9284d21))

## [0.2.8](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.2.7...v0.2.8) (2026-05-15)


### Bug Fixes

* extract shared helpers and use Channels constants in renderers ([50774ab](https://github.com/Anthoooooooony/whoosh-electron/commit/50774ab4cf3844114f6819c963091a9dc7442240))
* extract shared helpers and use Channels constants in renderers ([e99c9a9](https://github.com/Anthoooooooony/whoosh-electron/commit/e99c9a9dcbf27cf1950c791ffaa0362b601ca07b))

## [0.2.7](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.2.6...v0.2.7) (2026-05-14)


### Bug Fixes

* **hotkey:** use right Ctrl as the Windows trigger key ([2988a74](https://github.com/Anthoooooooony/whoosh-electron/commit/2988a74e9beaf4c4e09bc94002ceabd93f4d0b0d))
* **hotkey:** use right Ctrl as the Windows trigger key ([#44](https://github.com/Anthoooooooony/whoosh-electron/issues/44)) ([699415e](https://github.com/Anthoooooooony/whoosh-electron/commit/699415e1eb4d61a614fd3d1ec67c54d256b22f49))

## [0.2.6](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.2.5...v0.2.6) (2026-05-14)


### Bug Fixes

* **audio:** extract pure resampler from the worklet, fix bridge capture race ([d41022e](https://github.com/Anthoooooooony/whoosh-electron/commit/d41022e6b333ba6629347248e8c0a27feb58dbb1))
* **audio:** extract pure resampler from the worklet, fix bridge capture race ([71fb709](https://github.com/Anthoooooooony/whoosh-electron/commit/71fb7091edd9eda02fdd7bef0cb976cb35cfa7fd))
* **audio:** transpile worklet via ?worker&url so packaged apps can record ([62a2a5a](https://github.com/Anthoooooooony/whoosh-electron/commit/62a2a5a2c358e1b3c9b687d4da5618888d01b76b))
* **audio:** transpile worklet via ?worker&url so packaged apps can record ([97134d5](https://github.com/Anthoooooooony/whoosh-electron/commit/97134d54c346c52965f0631cfab9822bfbe91ce5))
* **doubao:** concentrate provider config resolution into one module ([a27cd41](https://github.com/Anthoooooooony/whoosh-electron/commit/a27cd412fcbb6754ee2f723887dce671fe3cdb1c))
* **doubao:** concentrate provider config resolution into one module ([7749c0b](https://github.com/Anthoooooooony/whoosh-electron/commit/7749c0bbcb805ca77d8f8237c4af8026f37f770d))
* **hotkey:** extract pure event-router from the uiohook shell ([07653f1](https://github.com/Anthoooooooony/whoosh-electron/commit/07653f1d8ba3e99ee45590de07db48ebbcd67285))
* **hotkey:** extract pure event-router from the uiohook shell ([cc93bc4](https://github.com/Anthoooooooony/whoosh-electron/commit/cc93bc4b9e9a4dcadb7acfc206f9bdf93bad6eb7))
* **orchestrator:** relocate seam to typed ports so the interface is the test surface ([ec2e85c](https://github.com/Anthoooooooony/whoosh-electron/commit/ec2e85c85147a4fb870073943750abb69130048a))
* **orchestrator:** relocate seam to typed ports so the interface is the test surface ([62a3e68](https://github.com/Anthoooooooony/whoosh-electron/commit/62a3e6867b25e0d8e27fe2701c47b643e4851d8e))

## [0.2.5](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.2.4...v0.2.5) (2026-05-12)


### Bug Fixes

* **deps:** bump ejs from 3.1.8 to 3.1.10 ([9742f78](https://github.com/Anthoooooooony/whoosh-electron/commit/9742f7864d6652e0adc751cccebc81e82a0ab776))
* **deps:** bump ejs from 3.1.8 to 3.1.10 ([b605686](https://github.com/Anthoooooooony/whoosh-electron/commit/b6056860b1bbe1d3543393fcd2798250d1a38c5a))
* **release:** only bump on code change, restrict commit types to feat/fix/docs ([f080e81](https://github.com/Anthoooooooony/whoosh-electron/commit/f080e81472ff07d90be74813283699643e8d1bbe))
* **release:** only bump on code change, restrict types to feat/fix/docs ([3f1c429](https://github.com/Anthoooooooony/whoosh-electron/commit/3f1c42925755647df20185ad6725e9e14af0cb2c))

## [0.2.4](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.2.3...v0.2.4) (2026-05-12)


### Bug Fixes

* **release-please:** hide docs/refactor/perf so only feat/fix bumps ([6d21fae](https://github.com/Anthoooooooony/whoosh-electron/commit/6d21fae022f28ae1cd40dbf606734eac0d231700))
* **release-please:** only feat/fix should bump version ([0639817](https://github.com/Anthoooooooony/whoosh-electron/commit/0639817448243afab944426a7721da7f6f1e2eb8))

## [0.2.3](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.2.2...v0.2.3) (2026-05-12)


### Bug Fixes

* **ci:** gate release PR dispatch on prs_created only ([5edc6d3](https://github.com/Anthoooooooony/whoosh-electron/commit/5edc6d3ffa8b7a7c2acbe70dd0222518948bfc90))
* **ci:** only dispatch release PR CI when a PR was actually opened ([7deaf6c](https://github.com/Anthoooooooony/whoosh-electron/commit/7deaf6c2f5c0979a9fc519d4f9c7cf185b061294))

## [0.2.2](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.2.1...v0.2.2) (2026-05-12)


### Bug Fixes

* **build:** drop inline NO_PROXY env var from build:native script ([b762c0c](https://github.com/Anthoooooooony/whoosh-electron/commit/b762c0cc168241535ea464e93d6fb011ccb8ee06))
* **build:** make build:native script cross-platform ([091b10d](https://github.com/Anthoooooooony/whoosh-electron/commit/091b10dff6c2beb092b4e9ee9bf852b9f87a5bde))

## [0.2.1](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.2.0...v0.2.1) (2026-05-12)


### Bug Fixes

* **ci:** chain workflows via workflow_dispatch to bypass GITHUB_TOKEN lock ([e2e4712](https://github.com/Anthoooooooony/whoosh-electron/commit/e2e471202096efb875d717fe08ea769d74255cfa))
* **ci:** chain workflows via workflow_dispatch to bypass GITHUB_TOKEN lock ([48f27b7](https://github.com/Anthoooooooony/whoosh-electron/commit/48f27b7d1cd5ca9d795b83553de68fa801d5a7e9))
* **ci:** pass --repo to gh workflow run ([fa40a70](https://github.com/Anthoooooooony/whoosh-electron/commit/fa40a7034716bcf713303e5d694f853e0b6c13a6))
* **ci:** pass --repo to gh workflow run ([b39085c](https://github.com/Anthoooooooony/whoosh-electron/commit/b39085c4cedda5d86065d40b4ba74da938a9bd32))
* **deps:** override @electron/get ^3.1.0 to unblock dmg build ([41b0951](https://github.com/Anthoooooooony/whoosh-electron/commit/41b0951e7936023ef995706694eb0b5e086d4c31))
* **deps:** override @electron/get ^3.1.0 to unblock dmg build ([07c49d3](https://github.com/Anthoooooooony/whoosh-electron/commit/07c49d35dd79b9dbbbc79c02759eb8e72b353368))

## [0.2.0](https://github.com/Anthoooooooony/whoosh-electron/compare/v0.1.0...v0.2.0) (2026-05-12)


### Features

* **audio:** AudioWorklet processor downsampling to 16kHz s16le ([21439be](https://github.com/Anthoooooooony/whoosh-electron/commit/21439befbab4e752561aeaf914f115a0afeae3c1))
* **audio:** getUserMedia + AudioContext bridge wiring to IPC ([3aebaf8](https://github.com/Anthoooooooony/whoosh-electron/commit/3aebaf84b624cd6ed586229c581d39025704aabc))
* **audio:** wire HotkeyFSM actions to audio renderer via IPC ([78c77b9](https://github.com/Anthoooooooony/whoosh-electron/commit/78c77b975866d336c8c495a493b01540314d10b4))
* **doubao:** DoubaoProvider implements ASRProvider ([00606e9](https://github.com/Anthoooooooony/whoosh-electron/commit/00606e99b3bda425a6bc517695aae61cc2a40927))
* **doubao:** DoubaoProvider with ws-mock integration tests + handshake correctness ([ae96770](https://github.com/Anthoooooooony/whoosh-electron/commit/ae96770c6fe3950f9568d5f22a818a3999548737))
* **doubao:** DoubaoSession WS state machine ([33f20fc](https://github.com/Anthoooooooony/whoosh-electron/commit/33f20fc14059a07d330ac8fca86940f3478006d0))
* **doubao:** endpoint/resource id variants + ASRProvider interface ([af57a46](https://github.com/Anthoooooooony/whoosh-electron/commit/af57a46912de7a669d36f8317afe70f317685df4))
* **doubao:** Seed protocol codec encode/decode ([c31ed37](https://github.com/Anthoooooooony/whoosh-electron/commit/c31ed375b50da39693d97059c32332f9abd85c93))
* **doubao:** Seed protocol constants ([2a7745f](https://github.com/Anthoooooooony/whoosh-electron/commit/2a7745fba850640f1c62f9f348c9c948699260ae))
* electron-vite + 4 empty renderers (M2) ([cd2afbe](https://github.com/Anthoooooooony/whoosh-electron/commit/cd2afbea84b779d507528cb2a568cc6dc94a8fba))
* **hotkey:** integrate uiohook-napi listener routing to FSM ([ba0c918](https://github.com/Anthoooooooony/whoosh-electron/commit/ba0c9184429f1011a715b91d6a44c373f448df89))
* **hotkey:** pure HotkeyFSM with state transition tests ([4a62eaa](https://github.com/Anthoooooooony/whoosh-electron/commit/4a62eaa658f4a785cf9876e574660a4ff686fd62))
* **hud:** full design-mock visuals, hover-to-cancel, 50ms show debounce ([4cc914f](https://github.com/Anthoooooooony/whoosh-electron/commit/4cc914fcea6d5b72e7bf90572dc9b7596f6283ca))
* **hud:** subscribe session events for live partial text + state ([2c7a1e5](https://github.com/Anthoooooooony/whoosh-electron/commit/2c7a1e502751c01eaa0251723e879c537225d823))
* **i18n:** react-i18next framework + zh-CN/en locale catalogs ([bfa09fd](https://github.com/Anthoooooooony/whoosh-electron/commit/bfa09fdb1d27803b6a429eeb57d41fbbd4369a7d))
* native paste addon with NSPasteboard markers (M4) ([6dc110b](https://github.com/Anthoooooooony/whoosh-electron/commit/6dc110b3dc9ffbaefc43a54ece750202b0d9de82))
* **onboarding:** 4-step flow + permission IPC + window orchestration ([2a133e2](https://github.com/Anthoooooooony/whoosh-electron/commit/2a133e23d7aca8edece40749b4373c15ca5c0938))
* **orchestrator:** SessionOrchestrator wires hotkey/audio/provider/paste ([3ffa929](https://github.com/Anthoooooooony/whoosh-electron/commit/3ffa92955a3d0811edf98f56b3b1a3e4b40fab89))
* **settings:** electron-store + safeStorage + full Settings UI ([48ed008](https://github.com/Anthoooooooony/whoosh-electron/commit/48ed008c6527e2902e37d86bb2dfa5b80f9eda06))
* **tray:** macOS menubar + Windows tray + hide Dock icon ([7b81a1e](https://github.com/Anthoooooooony/whoosh-electron/commit/7b81a1e4027e57fa003b99cf9b80c7f8bf42753a))
* typed IPC framework with zod schemas (M3) ([d08e079](https://github.com/Anthoooooooony/whoosh-electron/commit/d08e079a46347a9c9a7d5fc48de8e68c1e2b7416))
* **updater:** GitHub Releases passive version check ([2c5d78d](https://github.com/Anthoooooooony/whoosh-electron/commit/2c5d78dde3be4bc0d3d5ccf40d16d0ecc83b7621))


### Bug Fixes

* **audio:** renderer URL + drop runtime import of .d.ts; verify pipeline ([65ff775](https://github.com/Anthoooooooony/whoosh-electron/commit/65ff7759414bfee94a0105fa4deebbd020cef8af))
* **ci:** install pnpm via corepack instead of pnpm/action-setup ([e257c2e](https://github.com/Anthoooooooony/whoosh-electron/commit/e257c2e25e0f641b549961c3b6c91c17b748b41b))
* **ci:** setup Node 22 before pnpm to satisfy engine requirement ([c2fb4f7](https://github.com/Anthoooooooony/whoosh-electron/commit/c2fb4f78882ab330f1663fefedee24ee95b828d0))
* **ci:** setup Node 22 before pnpm to satisfy engine requirement ([a70aa68](https://github.com/Anthoooooooony/whoosh-electron/commit/a70aa68c5b5289ccb242725e25062800701808ed))
* **deps:** override yaml ^2.8.3 to patch GHSA stack overflow ([027aa19](https://github.com/Anthoooooooony/whoosh-electron/commit/027aa19af195f0f21b7457974fe1f1f0553b692c))
* **doubao:** NEG_WITH_SEQUENCE frame must encode sequence as negative int32 ([90ed8ed](https://github.com/Anthoooooooony/whoosh-electron/commit/90ed8ed8854f5f0c06d2028d946111bad539feaa))
* **session:** surface error and pass mic device when ws closes early ([f2f0472](https://github.com/Anthoooooooony/whoosh-electron/commit/f2f04725776fb2755cddc155ea455df6f978aef4))
* **ui:** drag region, mic dropdown, onboarding flow, HUD placeholder ([d3d541f](https://github.com/Anthoooooooony/whoosh-electron/commit/d3d541fc4ef3da2d0ff246ff6fa7c911057ce8ec))
* 端到端 UX 修复（窗口/拖动/Step 3-4/HUD/ws 兜底） ([049ac1c](https://github.com/Anthoooooooony/whoosh-electron/commit/049ac1ceb761d87a64ca24d109852edb913f9daf))


### Refactors

* **hotkey,ipc:** route through SessionOrchestrator, drop M5/M6 stubs ([d095fcd](https://github.com/Anthoooooooony/whoosh-electron/commit/d095fcd4511efac162bf8bf024247285b1a90601))


### Documentation

* **env:** .env.example template for dev-mode Doubao credentials ([7179cb3](https://github.com/Anthoooooooony/whoosh-electron/commit/7179cb31832d30c106a3a2bbcc6b8c79c790b112))
