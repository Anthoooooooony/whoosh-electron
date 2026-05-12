# Changelog

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
