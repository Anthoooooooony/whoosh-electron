# whoosh-electron — Implementation Blueprint

## A. File Tree

```
whoosh-electron/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # push: typecheck + lint + vitest
│   │   └── release.yml               # tag v*.*.*: matrix build + GitHub Release
│   └── release-please-config.json   # release-please 配置
├── .husky/
│   ├── pre-commit                    # lint-staged
│   ├── commit-msg                    # commitlint
│   └── pre-push                      # tsc --noEmit
├── design/
│   └── index.html                    # 视觉 mock（只读参考）
├── src/
│   ├── main/                         # 主进程
│   │   ├── index.ts                  # 入口：app ready, single-instance lock, lifecycle
│   │   ├── windows.ts                # 四个 BrowserWindow 的创建与管理
│   │   ├── tray.ts                   # macOS menubar NSStatusItem / Windows systray
│   │   ├── hotkey/
│   │   │   ├── index.ts              # uiohook-napi 初始化、事件路由
│   │   │   └── fsm.ts                # HotkeyFSM
│   │   ├── orchestrator/
│   │   │   └── index.ts              # SessionOrchestrator
│   │   ├── permission/
│   │   │   └── index.ts              # Accessibility / mic 权限检查 + 重启辅助
│   │   ├── updater/
│   │   │   └── index.ts              # GitHub Releases 版本检查
│   │   ├── store/
│   │   │   └── index.ts              # electron-store + safeStorage 封装
│   │   └── ipc/
│   │       └── index.ts              # ipcMain handler 注册总入口
│   │
│   ├── renderers/
│   │   ├── audio/                    # hidden audio renderer
│   │   │   ├── index.html
│   │   │   ├── main.tsx
│   │   │   ├── worklet/
│   │   │   │   └── processor.ts      # AudioWorkletProcessor：48k→16k downsample
│   │   │   └── bridge.ts             # IPC bridge
│   │   │
│   │   ├── hud/                      # 底部胶囊浮窗
│   │   │   ├── index.html
│   │   │   ├── main.tsx
│   │   │   ├── components/
│   │   │   │   ├── HudCapsule.tsx
│   │   │   │   ├── HudRecording.tsx
│   │   │   │   ├── HudHover.tsx
│   │   │   │   ├── HudProcessing.tsx
│   │   │   │   └── HudError.tsx
│   │   │   └── store.ts              # Zustand HUD 状态
│   │   │
│   │   ├── settings/
│   │   │   ├── index.html
│   │   │   ├── main.tsx
│   │   │   └── components/
│   │   │       ├── SettingsLayout.tsx
│   │   │       ├── sections/
│   │   │       │   ├── GeneralSection.tsx
│   │   │       │   ├── AudioSection.tsx
│   │   │       │   ├── ProviderSection.tsx
│   │   │       │   ├── SetupSection.tsx
│   │   │       │   └── AboutSection.tsx
│   │   │       └── shared/
│   │   │           └── PermissionRow.tsx
│   │   │
│   │   └── onboarding/
│   │       ├── index.html
│   │       ├── main.tsx
│   │       └── components/
│   │           ├── OnboardingShell.tsx
│   │           ├── Step1Credentials.tsx
│   │           ├── Step2Microphone.tsx
│   │           ├── Step3Accessibility.tsx
│   │           └── Step4Trial.tsx
│   │
│   ├── shared/                       # 跨进程共用，不含 Electron API 引用
│   │   ├── ipc/
│   │   │   ├── schemas.ts            # zod schema（单一来源）
│   │   │   ├── channels.ts           # channel 名常量
│   │   │   └── types.ts              # z.infer 推导类型
│   │   ├── types/
│   │   │   ├── provider.ts           # ASRProvider interface
│   │   │   ├── session.ts
│   │   │   ├── config.ts             # electron-store 结构
│   │   │   └── platform.ts
│   │   └── locales/
│   │       ├── zh-CN.json
│   │       └── en.json
│   │
│   ├── providers/
│   │   └── doubao/
│   │       ├── index.ts              # DoubaoProvider 实现 ASRProvider
│   │       ├── seed-codec.ts         # Seed 协议帧 encode/decode
│   │       ├── session.ts            # WS 会话生命周期
│   │       └── constants.ts          # ENDPOINT, MESSAGE_TYPES, 默认参数
│   │
│   └── native/
│       ├── paste/
│       │   ├── binding.gyp
│       │   ├── index.ts              # N-API JS 侧封装
│       │   ├── mac/
│       │   │   └── paste.mm          # NSPasteboard + CGEventPost
│       │   └── win/
│       │       └── paste.cpp         # SetClipboardData + SendInput
│       └── prebuilds/                # CI 输出预编译 .node
│           ├── darwin-arm64/paste.node
│           └── win32-x64/paste.node
│
├── resources/
│   ├── icons/
│   │   ├── icon.icns
│   │   ├── icon.ico
│   │   └── tray/
│   │       ├── trayTemplate.png      # macOS template image
│   │       └── tray.ico              # Windows
│   └── entitlements.mac.plist
│
├── electron.vite.config.ts
├── electron-builder.config.ts
├── tsconfig.json                     # root with references
├── tsconfig.main.json                # node target
├── tsconfig.renderer.json            # DOM target
├── tsconfig.shared.json
├── .eslintrc.cjs
├── .prettierrc
├── commitlint.config.cjs
├── vitest.config.ts
├── package.json
├── pnpm-lock.yaml
└── CLAUDE.md
```

---

## B. IPC Channel Contracts

所有 channel 名在 `/src/shared/ipc/channels.ts` 中以 `const` 对象声明，schema 在 `schemas.ts` 集中管理，两端通过 zod parse 校验。

### `audio:*`

| Channel | 方向 | Schema | 触发场景 |
|---|---|---|---|
| `audio:chunk` | audio-renderer → main | `{ chunk: Uint8Array, timestamp: number }` | AudioWorklet 每 40ms 一帧 |
| `audio:device-list` | invoke from renderer | req: void; res: `{ deviceId, label }[]` | Settings 麦克风 dropdown |
| `audio:set-device` | renderer → main | `{ deviceId: string \| null }` | 用户选择麦克风 |
| `audio:start` | main → audio-renderer | `{ deviceId: string \| null }` | HotkeyFSM recording |
| `audio:stop` | main → audio-renderer | void | 松开键 |
| `audio:abort` | main → audio-renderer | void | 取消 |

```ts
export const AudioChunkSchema = z.object({
  chunk: z.instanceof(Uint8Array),
  timestamp: z.number().int().positive(),
})
export const DeviceListItemSchema = z.object({
  deviceId: z.string(),
  label: z.string(),
})
```

### `session:*`

| Channel | 方向 | Schema | 触发场景 |
|---|---|---|---|
| `session:state` | main → all renderers (broadcast) | `{ state, durationMs? }` | SessionOrchestrator 状态变化 |
| `session:partial` | main → hud | `{ text: string }` | provider partial result |
| `session:final` | main → hud | `{ text, durationMs }` | provider final result |
| `session:error` | main → hud | `{ code, message }` | 网络/provider 错误 |

```ts
export const SessionStateSchema = z.enum(['idle', 'recording', 'processing', 'error'])
export const ErrorCodeSchema = z.enum([
  'NETWORK_ERROR', 'PROVIDER_AUTH', 'PROVIDER_QUOTA',
  'MIC_PERMISSION', 'DURATION_TOO_SHORT', 'UNKNOWN',
])
```

### `hud:*`

| Channel | 方向 | Schema | 触发场景 |
|---|---|---|---|
| `hud:cancel` | hud → main | void | 用户点取消转录 |
| `hud:show` | main → hud | `{ state: HudStateSchema }` | 50ms 防抖后显示 |
| `hud:hide` | main → hud | void | 会话结束或 error 2s 后 |

```ts
export const HudStateSchema = z.enum(['recording', 'hover', 'processing', 'error'])
```

### `settings:*`

| Channel | 方向 | Schema | 触发场景 |
|---|---|---|---|
| `settings:get` | invoke | req: void; res: `ConfigSchema` | Settings 加载 |
| `settings:set` | invoke | `Partial<ConfigSchema>` | 用户改设置 |
| `settings:get-apikey` | invoke | req: `{ providerId }`; res: `{ key \| null }` | 凭据页初始化 |
| `settings:set-apikey` | invoke | `{ providerId, key }` | 用户填 token |

### `provider:*`

| Channel | 方向 | Schema | 触发场景 |
|---|---|---|---|
| `provider:test-connection` | invoke | req: `{ providerId, credentials }`; res: `{ ok, error? }` | Onboarding/Settings Test |

### `onboarding:*`

| Channel | 方向 | Schema | 触发场景 |
|---|---|---|---|
| `onboarding:get-step` | invoke | res: `{ step, platform }` | onboarding 加载 |
| `onboarding:complete-step` | invoke | req: `{ step }`; res: `{ nextStep \| null }` | 步骤完成 |
| `onboarding:done` | renderer → main | void | Step 4 完成 |

### `permission:*`

| Channel | 方向 | Schema | 触发场景 |
|---|---|---|---|
| `permission:status` | invoke | res: `{ mic, accessibility \| null }` | Settings/Onboarding |
| `permission:request-mic` | invoke | res: `{ granted }` | Onboarding Step2 |
| `permission:open-system-prefs` | renderer → main | `{ pane: 'accessibility' \| 'microphone' }` | 跳系统设置 |

### `updater:*`

| Channel | 方向 | Schema | 触发场景 |
|---|---|---|---|
| `updater:check` | invoke | res: `{ hasUpdate, version?, url? }` | About 检查更新 |
| `updater:new-version` | main → settings | `{ version, url }` | 后台发现新版 |

---

## C. 模块边界与依赖

### 职责一句话

| 模块 | 职责 |
|---|---|
| `main/index.ts` | app 生命周期、single-instance lock、按序初始化子模块 |
| `main/windows.ts` | 持有四个 BrowserWindow 引用，封装 show/hide/create |
| `main/tray.ts` | 构建 tray/menubar icon 和右键菜单 |
| `main/hotkey/fsm.ts` | 纯状态机，输入 keydown/keyup，输出 action |
| `main/hotkey/index.ts` | uiohook-napi 注册，过滤右 Option/Alt rawcode |
| `main/orchestrator/index.ts` | 协调 audio + provider + paste 时序 |
| `main/permission/index.ts` | systemPreferences 封装，macOS Accessibility 重启辅助 |
| `main/updater/index.ts` | 定时 fetch Releases，semver 比较 |
| `main/store/index.ts` | electron-store + safeStorage 封装，强类型 API |
| `main/ipc/index.ts` | 集中注册 ipcMain handler |
| `providers/doubao/seed-codec.ts` | 纯函数 encode/decode，可独立 Vitest |
| `providers/doubao/session.ts` | WS 连接生命周期状态机 |
| `providers/doubao/index.ts` | 组合 codec + session，实现 ASRProvider |
| `native/paste/index.ts` | 加载 prebuilt .node，暴露 pasteText 封装 |

### 依赖方向图

```
main/index.ts
  ├── main/windows.ts
  ├── main/tray.ts ──────────────── main/updater/index.ts
  ├── main/ipc/index.ts
  │     ├── main/store/index.ts
  │     ├── main/permission/index.ts
  │     ├── main/updater/index.ts
  │     └── main/orchestrator/index.ts
  └── main/hotkey/index.ts
        └── main/hotkey/fsm.ts
              └── main/orchestrator/index.ts
                    ├── providers/doubao/index.ts
                    │     ├── providers/doubao/session.ts
                    │     └── providers/doubao/seed-codec.ts
                    └── native/paste/index.ts

渲染进程（单向，通过 contextBridge/preload）：
  audio-renderer      → main (audio:chunk, audio:start/stop/abort)
  hud-renderer        → main (hud:cancel); ← main (hud:show/hide, session:*)
  settings-renderer   → main (settings:*, permission:*, updater:*)
  onboarding-renderer → main (onboarding:*, permission:*, provider:test-connection)
```

### 三个核心 FSM

**HotkeyFSM** (`main/hotkey/fsm.ts`)

```ts
type HotkeyState = 'idle' | 'recording' | 'canceling' | 'processing'

type HotkeyEvent =
  | { type: 'KEY_DOWN'; ts: number }
  | { type: 'KEY_UP'; ts: number }
  | { type: 'CANCEL_CLICK' }
  | { type: 'SESSION_DONE' }
  | { type: 'SESSION_ERROR' }

type HotkeyAction =
  | 'START_RECORDING'
  | 'COMMIT_RECORDING'
  | 'ABORT_SHORT'        // < 300ms 误触
  | 'ABORT_CANCEL'       // 用户点取消
  | 'DONE'

interface HotkeyFSM {
  send(event: HotkeyEvent): HotkeyAction | null
  getState(): HotkeyState
}
```

**SessionOrchestrator** (`main/orchestrator/index.ts`)

```ts
type OrchestratorState = 'idle' | 'recording' | 'processing' | 'pasting' | 'error'

interface SessionOrchestrator {
  onHotkeyAction(action: HotkeyAction): Promise<void>
  getState(): OrchestratorState
}
```

**HUD store**（hud-renderer Zustand store）

```ts
type HudState = 'hidden' | 'recording' | 'hover' | 'processing' | 'error'

interface HudStore {
  state: HudState
  durationMs: number
  errorMessage: string | null
  show(state: Exclude<HudState, 'hidden'>): void
  hide(): void
  setError(msg: string): void
  tick(): void
}
```

---

## D. Provider 接口与豆包实现要点

### ASRProvider 完整签名

```ts
import { EventEmitter } from 'node:events'

export interface ASRStartOptions {
  sampleRate: 16000
  encoding: 'pcm_s16le'
}

export interface ASRCapabilities {
  streaming: boolean
  partialResults: boolean
}

export interface ASRProvider extends EventEmitter {
  readonly id: string
  readonly capabilities: ASRCapabilities
  readonly settingsSchema: Record<string, unknown>
  readonly defaults: Record<string, unknown>

  start(opts: ASRStartOptions): Promise<void>
  pushAudio(chunk: Buffer): void
  finish(): Promise<void>
  abort(): void

  on(event: 'partial', listener: (text: string) => void): this
  on(event: 'final', listener: (text: string) => void): this
  on(event: 'error', listener: (err: ASRError) => void): this
}

export interface ASRError {
  code: 'AUTH' | 'QUOTA' | 'NETWORK' | 'PROTOCOL' | 'UNKNOWN'
  message: string
  retryable: boolean
}
```

### Seed Codec 关键常量 + 函数签名

```ts
// constants.ts
export const DOUBAO_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel'
export const RESOURCE_ID = 'volc.bigasr.sauc.duration'

export const MessageType = {
  FULL_CLIENT_REQUEST:  0x1,
  AUDIO_ONLY_REQUEST:   0x2,
  FULL_SERVER_RESPONSE: 0x9,
  SERVER_ACK:           0xB,
  SERVER_ERROR:         0xF,
} as const

export const Serialization = { JSON: 0x1, THRIFT: 0x3 } as const
export const Compression   = { NONE: 0x0, GZIP: 0x1 } as const
export const Flags = {
  NO_SEQUENCE: 0x0, POS_SEQUENCE: 0x1, NEG_SEQUENCE: 0x2, NEG_WITH_SEQUENCE: 0x3,
} as const

// seed-codec.ts
export interface SeedHeader {
  protocolVersion: number   // 4 bits
  headerSize: number        // 4 bits（单位 4 bytes，固定 1）
  messageType: number       // 4 bits
  flags: number             // 4 bits
  serialization: number     // 4 bits
  compression: number       // 4 bits
  reserved: number          // 8 bits
}
export interface SeedFrame {
  header: SeedHeader
  sequenceNumber?: number
  payload: Buffer
}
export function encodeControlFrame(messageType: number, json: Record<string, unknown>): Buffer
export function encodeAudioFrame(chunk: Buffer, sequenceNumber: number, isLast: boolean): Buffer
export function decodeFrame(data: Buffer): SeedFrame
export function extractJsonPayload(frame: SeedFrame): unknown
```

### WS 重连策略

- 连接失败或 close：等 500ms 后重连一次
- 3s 内未触发 ConnectionStarted → emit error(NETWORK, retryable: false)
- 会话期间断线：立即 emit error，不重建会话（音频上下文已丢失）
- 鉴权失败（HTTP 401）：emit error(AUTH, retryable: false)

---

## E. Native Paste Addon

### N-API JS 侧接口

```ts
export interface PasteOptions {
  preserveClipboard?: boolean   // 默认 true
  markTransient?: boolean       // 默认 true
}
export interface NativePaste {
  pasteText(text: string, opts?: PasteOptions): void
}
export declare const nativePaste: NativePaste
```

按 `process.platform-process.arch` 路径加载对应 prebuilt `.node`。

### macOS (`paste.mm`)

1. 保存 `[NSPasteboard generalPasteboard]` 当前 `NSPasteboardTypeString`
2. 清空 pasteboard，写新文本
3. 附加 `org.nspasteboard.ConcealedType`（空值标记）
4. `CGEventCreateKeyboardEvent` 生成 ⌘+V down/up 事件序列，`CGEventPost(kCGHIDEventTap, ...)`
5. `dispatch_after` GCD main queue 延迟 400ms 恢复原内容
6. 单文件约 120 行

### Windows (`paste.cpp`)

1. `OpenClipboard` + `GetClipboardData(CF_UNICODETEXT)` 保存
2. `EmptyClipboard` + `SetClipboardData(CF_UNICODETEXT, ...)` 写
3. 注册 `ExcludeClipboardContentFromMonitorProcessing` 和 `CanIncludeInClipboardHistory`（DWORD 1 / 0）
4. INPUT 数组：VK_CONTROL down → V down → V up → VK_CONTROL up → `SendInput`
5. **ARCHITECT RECOMMENDED**: `Napi::AsyncWorker` 在 worker 线程执行整流程，避免阻塞 main thread
6. 单文件约 150 行

### binding.gyp 要点

```json
{
  "targets": [{
    "target_name": "paste",
    "conditions": [
      ["OS=='mac'", {
        "sources": ["mac/paste.mm"],
        "link_settings": { "libraries": ["-framework Cocoa", "-framework ApplicationServices"] },
        "xcode_settings": { "CLANG_ENABLE_OBJC_ARC": "YES" }
      }],
      ["OS=='win'", {
        "sources": ["win/paste.cpp"],
        "libraries": ["user32.lib"]
      }]
    ],
    "include_dirs": ["<!(node -p \"require('node-addon-api').include_dir\")"],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
  }]
}
```

### Prebuild + electron-builder 链路

- CI job `build-native`：macos-14 (arm64) + windows-latest (x64) 各跑 `node-gyp rebuild`，输出 `.node` 上传为 artifact
- 主 build job `depends-on: build-native`，下载 artifact → `src/native/prebuilds/{platform}-{arch}/paste.node`
- `electron-builder` 的 `extraResources` 仅打对应平台 `.node`，运行时用 `process.resourcesPath` 拼接加载

---

## F. Build / 实施顺序

### M1 项目骨架 + Tooling
**目标**：pnpm install、commit 校验、TS strict 就位
**涉及**：`package.json`、4 个 tsconfig、`.eslintrc`、`.prettierrc`、`commitlint.config`、`.husky/*`、`CLAUDE.md`
**验收**：`tsc --noEmit` 通过，坏 commit message 被拒

### M2 electron-vite 多 Renderer + 空壳跑通
**目标**：`pnpm dev` 启动，四个 BrowserWindow 加载对应 renderer
**涉及**：`electron.vite.config.ts`、`main/index.ts` 骨架、`main/windows.ts`、四个 renderer 的 `index.html` + 空 `main.tsx`
**验收**：Electron 窗口可见，DevTools 无报错

### M3 IPC 框架
**目标**：双端 type-safe IPC，channel + schema 落地
**涉及**：`shared/ipc/schemas.ts`、`channels.ts`、`types.ts`、各 renderer `preload.ts`、`main/ipc/index.ts` stub
**验收**：Vitest schema parse 单测；renderer `window.ipc.invoke` TS 类型正确

### M4 Native Paste Addon
**目标**：macOS 本机调用 `pasteText("hello")`，Windows CI 编译通过
**涉及**：`native/paste/binding.gyp`、`mac/paste.mm`、`win/paste.cpp`、`native/paste/index.ts`
**验收**：macOS 手动测试粘贴；Windows CI 编译通过；clipboard 历史不显示

### M5 uiohook + HotkeyFSM
**目标**：按住右 Option/Alt 打印 START_RECORDING；松开打印 COMMIT；< 300ms 打印 ABORT_SHORT
**涉及**：`main/hotkey/fsm.ts`、`main/hotkey/index.ts`
**验收**：Vitest 覆盖 FSM 全状态转换；未授权时不崩溃

### M6 Audio Renderer
**目标**：audio renderer 捕获麦克风，AudioWorklet 48k→16k downsample，每 40ms 发 `audio:chunk`
**涉及**：`renderers/audio/main.tsx`、`worklet/processor.ts`、`bridge.ts`
**验收**：main 收到 chunk，~1280 bytes/帧（16000×40ms×2bytes×1ch）

### M7 Seed Codec
**目标**：encode 后 decode 还原，wire format 与豆包参考实现 byte-for-byte 对齐
**涉及**：`providers/doubao/seed-codec.ts`、`constants.ts`
**验收**：Vitest 单测 + golden fixture 字节对比

### M8 Doubao Provider
**目标**：真实 WS 会话，发送音频，收到 partial/final
**涉及**：`providers/doubao/session.ts`、`index.ts`
**验收**：ws-mock 集成测试覆盖 happy path + AUTH + 重连；真实凭据 10s 录音

### M9 SessionOrchestrator（端到端）
**目标**：按住右 Option → 录音 → 松开 → ASR → 粘贴到当前 app
**涉及**：`main/orchestrator/index.ts`
**验收**：实际语音输入到 VSCode/TextEdit；< 300ms 无输出；网络断开走 error 路径

### M10 HUD Renderer（四态）
**目标**：HUD 胶囊浮窗状态正确切换，还原设计 mock
**涉及**：`renderers/hud/`
**设计参考**：`design/index.html`（304×52，border-radius 26，backdrop-filter blur 24）
**验收**：四态截图对比；全屏 app 上方可见；hover 触发态切换

### M11 Settings Renderer
**目标**：完整设置功能（凭据、麦克风、权限、About + 检查更新）
**涉及**：`renderers/settings/`
**验收**：关窗不退出；设置即时持久化；权限行显示正确

### M12 Onboarding Renderer
**目标**：首次启动 4 步（Windows 3 步），完成后不再出现
**涉及**：`renderers/onboarding/`、`main/permission/`
**验收**：macOS Accessibility 授权后自动重启从 Step 4 恢复；Step 1 Test Connection 真实验证

### M13 国际化
**目标**：renderer 无硬编码字符串，zh-CN/en 切换生效
**涉及**：`shared/locales/`、各 renderer 替换为 `t('key')`
**验收**：切换语言 UI 即时更新；无遗漏硬编码

### M14 Menubar/Tray
**目标**：macOS menubar 无 Dock 图标，Windows 系统托盘，右键菜单完整
**涉及**：`main/tray.ts`、`resources/icons/tray/`
**验收**：LSUIElement=true；跨 Space 持久可见；图标态切换

### M15 GitHub Releases 版本检查
**目标**：启动 + 6h 周期检查，新版时 tray 菜单出现 Update available
**涉及**：`main/updater/index.ts`、修改 `main/tray.ts`
**验收**：mock API 返回高版本菜单更新；点击 `shell.openExternal`

### M16 CI + release-please
**目标**：push 跑 CI；tag 触发 matrix build；release-please 自动 bump
**涉及**：`.github/workflows/*.yml`、`release-please-config.json`
**验收**：PR CI 全绿；tag v0.1.0 产出 dmg + exe；release-please PR 自动创建

---

## G. 依赖清单

### Runtime

| 包 | 版本约束 | 选型理由 |
|---|---|---|
| `electron` | ^35 | 最新稳定，macOS arm64 原生 |
| `electron-store` | ^10 | 进程安全 JSON 存储 |
| `electron-log` | ^5 | multi-process forward + rotate |
| `uiohook-napi` | ^1 | 区分左右修饰键，跨平台 prebuilt |
| `zod` | ^3 | runtime schema 校验 |
| `react` | ^19 | |
| `react-dom` | ^19 | |
| `react-i18next` | ^15 | i18n Hooks API |
| `i18next` | ^24 | peer dep |
| `zustand` | ^5 | HUD 轻量状态 |
| `ws` | ^8 | WS 客户端（main 进程） |
| `node-addon-api` | ^8 | N-API C++ 封装 |

### Dev

| 包 | 用途 |
|---|---|
| `electron-vite` | 多 renderer Vite 配置 + HMR |
| `electron-builder` | installer 打包 + extraResources |
| `typescript` | ^5.8 strict |
| `vite`, `@vitejs/plugin-react` | |
| `tailwindcss` | ^4 |
| `@tailwindcss/vite` | Tailwind v4 Vite 插件 |
| `shadcn/ui` CLI | 组件源码按需引入 |
| `eslint` ^9 flat config | |
| `@typescript-eslint/eslint-plugin` | |
| `prettier` | |
| `husky` | git hooks |
| `lint-staged` | |
| `@commitlint/cli` + `config-conventional` | |
| `vitest` + `ws` (mock) | |
| `release-please` | |

### Native Build

- `node-gyp`（vs cmake-js：node-addon-api 官方支持、binding.gyp 更成熟、Windows MSVC 兼容更好）
- Xcode Command Line Tools (macOS CI)
- MSVC Build Tools (windows-latest 自带)

### CI

- `actions/checkout@v4`
- `pnpm/action-setup@v4`
- `actions/setup-node@v4` (pnpm cache)
- `google-github-actions/release-please-action@v4`

---

## H. 风险与待澄清

**H-1 Seed 协议 wire format 字段名二次核对（高）**
seed-codec header bit layout 和 JSON payload 字段名需与 `volcengine-audio` Python SDK byte-for-byte 对照。重点：`sequence_number` 是否紧跟 header（4 bytes），GZIP 仅压缩 payload 还是含 header，StartSession config JSON key 命名（`audio_config` vs `audio`）。M7 必须制作 golden fixture，不要跳过。

**H-2 uiohook-napi macOS 14+ Accessibility 重启行为（高）**
未授权时调用 `start()` 抛异常而非返回错误。在 `main/hotkey/index.ts` try-catch 包裹，permission 模块 gate 后才初始化。macOS 15.x TCC 授权 cache 机制变化，授权后可能需等 1-2s 生效，重启前加 `setTimeout(app.relaunch, 500)`。

**H-3 BrowserWindow `type:'panel'` 在 Sequoia 兼容性（中）**
**ARCHITECT RECOMMENDED**: 优先用 `setAlwaysOnTop(true, 'screen-saver')` 而非 panel type，panel 仅 fallback。screen-saver level 在 macOS 15 上与全屏 app 层级关系更稳定。

**H-4 pnpm hoisting 与 electron-builder（中）**
electron-builder 期望传统 node_modules 结构，pnpm symlink hoisting 可能导致 native `.node` 无法正确 bundle。`electron-builder.config.ts` 明确 `extraResources` 指向 prebuilds 目录，绕过 builder 自动探测。`.npmrc` 设置 `node-linker=hoisted` 兼容。

**H-5 AudioWorklet Uint8Array 跨 IPC 传输（中）**
**ARCHITECT RECOMMENDED**: audio preload 中使用 `ipcRenderer.postMessage(channel, message, [transfer])` 启用 transferable 避免拷贝。单帧 ~1280 bytes × 25fps = ~32KB/s 即便拷贝也可接受，但 transferable 更干净。

**H-6 `org.nspasteboard.ConcealedType` 有效性（低）**
第三方规范（非 Apple 官方），依赖剪贴板管理器（Alfred / Paste / Raycast）自愿遵守。对系统原生剪贴板历史无效。v1 自用可接受。

**H-7 release-please GitHub Actions 权限（低）**
需 `contents: write` + `pull-requests: write`。仓库 Settings → Actions → Workflow permissions 设 "Read and write"。

**H-8 Windows clipboard format 注册（低）**
`ExcludeClipboardContentFromMonitorProcessing` 是 Windows 10 1809+ 公开 API，通过 `RegisterClipboardFormat` 注册后作为标记。MSVC 编译需确认 `<clipboardformats.h>` 可用。
