// IPC handler 注册总入口
//
// 设计要点：
//   - 所有 invoke / send 入参在边界做 zod parse，校验失败直接拒绝 + 日志
//   - audio:chunk 由 SessionOrchestrator 通过 onAudioChunk 回调消费
//   - 注册函数 idempotent（重复调用 throw），由 main/index.ts 在 app.whenReady 之后调用一次

import { app, ipcMain, systemPreferences } from 'electron'
import { checkOnce as updaterCheckOnce } from '../updater/index.js'
import { openSystemPrefPane } from '../system-prefs.js'
import { z } from 'zod'
import { Channels } from '@shared/ipc/channels.js'
import type { InvokeContract, SendContract } from '@shared/ipc/types.js'
import {
  AudioCaptureEndedSchema,
  AudioChunkSchema,
  OnboardingCompleteStepRequestSchema,
  PermissionOpenSystemPrefsSchema,
  ProviderTestConnectionRequestSchema,
  ProviderTestConnectionResponseSchema,
  SettingsGetApikeySchema,
  SettingsSetApikeySchema,
  SettingsSetSchema,
} from '@shared/ipc/schemas.js'

import type { AppConfig, AppConfigPatch, SetApiKeyResult } from '../store/index.js'

export interface IpcHandlerDeps {
  /** orchestrator 消费 audio renderer 推上来的每一帧 PCM */
  onAudioChunk(chunk: Buffer): void
  /**
   * audio renderer 上报采集异常终止（麦克风权限被撤销 / 设备被抢占）。
   * orchestrator 把它翻译成 SESSION_ERROR 给 HUD，详见 issue #60。
   */
  onAudioCaptureEnded(reason: 'mic-lost'): void
  /** HUD 点击「取消转录」时调；通常 dispatch CANCEL_CLICK 给 FSM */
  onHudCancel(): void
  /** 读取当前配置 */
  getConfig(): AppConfig
  /** 部分更新配置；返回合并后的新配置 */
  setConfig(patch: AppConfigPatch): AppConfig
  /** 读取某 provider 的 API key（safeStorage 解密后） */
  getApiKey(providerId: string): string | null
  /** 写入某 provider 的 API key；safeStorage 不可用时返回失败由 UI 处理 */
  setApiKey(providerId: string, key: string): SetApiKeyResult
  /** 用候选凭据真实连接一次 ASR provider 做握手，验证可用 */
  testProviderConnection(
    req: z.infer<typeof ProviderTestConnectionRequestSchema>,
  ): Promise<z.infer<typeof ProviderTestConnectionResponseSchema>>
  /** Onboarding 完成时调；通常隐藏 onboarding window + 显示 settings */
  onOnboardingDone(): void
}

// ───────────────────────────────────────────
// helpers
// ───────────────────────────────────────────
function handleInvoke<C extends keyof InvokeContract>(
  channel: C,
  reqSchema: z.ZodType<InvokeContract[C]['req']> | null,
  handler: (
    req: InvokeContract[C]['req'],
  ) => Promise<InvokeContract[C]['res']> | InvokeContract[C]['res'],
): void {
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    let req: InvokeContract[C]['req']
    if (reqSchema === null) {
      req = undefined as InvokeContract[C]['req']
    } else {
      const parsed = reqSchema.safeParse(raw)
      if (!parsed.success) {
        console.error(`[ipc] ${channel} invalid request`, parsed.error.issues)
        throw new Error(`ipc ${channel}: schema validation failed`)
      }
      req = parsed.data
    }
    return handler(req)
  })
}

function handleSend<C extends keyof SendContract>(
  channel: C,
  payloadSchema: z.ZodType<SendContract[C]> | null,
  handler: (payload: SendContract[C]) => void,
): void {
  ipcMain.on(channel, (_event, raw: unknown) => {
    if (payloadSchema === null) {
      handler(undefined as SendContract[C])
      return
    }
    const parsed = payloadSchema.safeParse(raw)
    if (!parsed.success) {
      console.error(`[ipc] ${channel} invalid payload`, parsed.error.issues)
      return
    }
    handler(parsed.data)
  })
}

// ───────────────────────────────────────────
// 注册总入口
// ───────────────────────────────────────────
let registered = false

export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  if (registered) throw new Error('IPC handlers already registered')
  registered = true

  // ─── invoke ───────────────────────────────
  handleInvoke(Channels.AUDIO_DEVICE_LIST, null, () => {
    console.info('[ipc] audio:device-list (stub)')
    return []
  })

  handleInvoke(Channels.SETTINGS_GET, null, () => {
    return deps.getConfig()
  })

  handleInvoke(Channels.SETTINGS_SET, SettingsSetSchema, (req) => {
    return deps.setConfig(req)
  })

  handleInvoke(Channels.SETTINGS_GET_APIKEY, SettingsGetApikeySchema, (req) => {
    return { key: deps.getApiKey(req.providerId) }
  })

  handleInvoke(Channels.SETTINGS_SET_APIKEY, SettingsSetApikeySchema, (req) => {
    return deps.setApiKey(req.providerId, req.key)
  })

  handleInvoke(
    Channels.PROVIDER_TEST_CONNECTION,
    ProviderTestConnectionRequestSchema,
    async (req) => {
      const result = await deps.testProviderConnection(req)
      // 兜底校验输出
      const parsed = ProviderTestConnectionResponseSchema.safeParse(result)
      return parsed.success
        ? parsed.data
        : { ok: false, error: 'invalid testProviderConnection result' }
    },
  )

  handleInvoke(Channels.ONBOARDING_GET_STEP, null, () => {
    const cfg = deps.getConfig()
    const completed = new Set(cfg.onboarding.completedSteps)
    // 决定从哪一步开始：找到第一个未完成的步骤
    const platform: 'darwin' | 'win32' = process.platform === 'darwin' ? 'darwin' : 'win32'
    const allSteps: (1 | 2 | 3 | 4)[] = platform === 'darwin' ? [1, 2, 3, 4] : [1, 2, 4]
    const next = allSteps.find((s) => !completed.has(`step${s}`))
    return { step: (next ?? 4) as 1 | 2 | 3 | 4, platform }
  })

  handleInvoke(Channels.ONBOARDING_COMPLETE_STEP, OnboardingCompleteStepRequestSchema, (req) => {
    const cfg = deps.getConfig()
    const completed = Array.from(new Set([...cfg.onboarding.completedSteps, `step${req.step}`]))
    deps.setConfig({ onboarding: { completedSteps: completed, done: cfg.onboarding.done } })
    const platform: 'darwin' | 'win32' = process.platform === 'darwin' ? 'darwin' : 'win32'
    const allSteps: (1 | 2 | 3 | 4)[] = platform === 'darwin' ? [1, 2, 3, 4] : [1, 2, 4]
    const nextStep = allSteps.find((s) => !completed.includes(`step${s}`))
    return { nextStep: (nextStep ?? null) as 1 | 2 | 3 | 4 | null }
  })

  handleInvoke(Channels.PERMISSION_STATUS, null, async () => {
    let mic = false
    if (process.platform === 'darwin' || process.platform === 'win32') {
      const status = systemPreferences.getMediaAccessStatus('microphone')
      mic = status === 'granted'
    } else {
      mic = true // Linux 没标准权限模型，默认 true
    }
    const accessibility =
      process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : null
    return { mic, accessibility }
  })

  handleInvoke(Channels.PERMISSION_REQUEST_MIC, null, async () => {
    if (process.platform === 'darwin') {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      return { granted }
    }
    // Windows 在 getUserMedia 时由 session.permissionRequestHandler 处理；这里乐观返回 true
    return { granted: true }
  })

  handleInvoke(Channels.UPDATER_CHECK, null, async () => {
    return updaterCheckOnce()
  })

  // ─── send (one-way) ───────────────────────
  handleSend(Channels.AUDIO_CHUNK, AudioChunkSchema, (payload) => {
    // Uint8Array → Buffer 零拷贝（共享同一 ArrayBuffer）
    const buf = Buffer.from(
      payload.chunk.buffer,
      payload.chunk.byteOffset,
      payload.chunk.byteLength,
    )
    deps.onAudioChunk(buf)
  })

  handleSend(Channels.AUDIO_SET_DEVICE, null, () => {
    console.info('[ipc] audio:set-device (stub)')
  })

  handleSend(Channels.AUDIO_CAPTURE_ENDED, AudioCaptureEndedSchema, (payload) => {
    deps.onAudioCaptureEnded(payload.reason)
  })

  handleSend(Channels.HUD_CANCEL, null, () => {
    deps.onHudCancel()
  })

  handleSend(Channels.ONBOARDING_DONE, null, () => {
    const cfg = deps.getConfig()
    deps.setConfig({
      onboarding: { completedSteps: cfg.onboarding.completedSteps, done: true },
    })
    deps.onOnboardingDone()
  })

  handleSend(Channels.PERMISSION_OPEN_SYSTEM_PREFS, PermissionOpenSystemPrefsSchema, (payload) => {
    openSystemPrefPane(payload.pane)
  })

  handleSend(Channels.APP_RELAUNCH, null, () => {
    // dev 模式：electron-vite 持有 vite dev server，进程退出后 vite 也会关闭，
    // app.relaunch() 拉起的新 Electron 连不上 :5173 → 空白窗口。
    // 跳过真实退出，让 onboarding 正常推进到 Step 4；用户手动 pnpm dev 即可。
    if (process.env['ELECTRON_RENDERER_URL']) {
      console.info('[main] dev mode: skip app.relaunch; rerun `pnpm dev` to reload hotkey listener')
      return
    }
    app.relaunch()
    app.quit()
  })
}

// app 重启工具（onboarding Step 3 Accessibility 授权后用）。
// 必须用 app.quit() 而非 app.exit()：relaunch() 把 spawn 挂在 'quit' 事件上，
// exit() 直接终止进程会跳过该回调，新实例不会被拉起。
export function relaunchApp(): void {
  app.relaunch()
  app.quit()
}
