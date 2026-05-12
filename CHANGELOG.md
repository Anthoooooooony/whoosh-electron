# Changelog

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
