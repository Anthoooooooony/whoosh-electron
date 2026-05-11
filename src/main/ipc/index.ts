// IPC handler 注册总入口
//
// 设计要点：
//   - 所有 invoke / send 入参在边界做 zod parse，校验失败直接拒绝 + 日志
//   - M3 阶段 handler 全部是 stub（log + dummy response），后续 milestone 替换：
//       settings: M11 / provider:test-connection: M8 (real) / permission:*: M12 / updater:check: M15 / onboarding:*: M12
//   - audio:chunk 在 M9 由 SessionOrchestrator 消费（通过 onAudioChunk 注入回调）
//   - 注册函数 idempotent（重复调用 throw），由 main/index.ts 在 app.whenReady 之后调用一次

import { ipcMain } from 'electron'
import { z } from 'zod'
import { Channels } from '@shared/ipc/channels.js'
import type { InvokeContract, SendContract } from '@shared/ipc/types.js'
import {
  AudioChunkSchema,
  OnboardingCompleteStepRequestSchema,
  PermissionOpenSystemPrefsSchema,
  ProviderTestConnectionRequestSchema,
  ProviderTestConnectionResponseSchema,
  SettingsGetApikeySchema,
  SettingsSetApikeySchema,
  SettingsSetSchema,
} from '@shared/ipc/schemas.js'

import type { AppConfig, AppConfigPatch } from '../store/index.js'

export interface IpcHandlerDeps {
  /** orchestrator 消费 audio renderer 推上来的每一帧 PCM */
  onAudioChunk(chunk: Buffer): void
  /** HUD 点击「取消转录」时调；通常 dispatch CANCEL_CLICK 给 FSM */
  onHudCancel(): void
  /** 读取当前配置 */
  getConfig(): AppConfig
  /** 部分更新配置；返回合并后的新配置 */
  setConfig(patch: AppConfigPatch): AppConfig
  /** 读取某 provider 的 API key（safeStorage 解密后） */
  getApiKey(providerId: string): string | null
  /** 写入某 provider 的 API key */
  setApiKey(providerId: string, key: string): void
  /** 用候选凭据真实连接一次 ASR provider 做握手，验证可用 */
  testProviderConnection(
    req: z.infer<typeof ProviderTestConnectionRequestSchema>,
  ): Promise<z.infer<typeof ProviderTestConnectionResponseSchema>>
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
    deps.setApiKey(req.providerId, req.key)
    return { ok: true as const }
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
    console.info('[ipc] onboarding:get-step (stub)')
    return { step: 1 as const, platform: process.platform as 'darwin' | 'win32' | 'linux' }
  })

  handleInvoke(Channels.ONBOARDING_COMPLETE_STEP, OnboardingCompleteStepRequestSchema, (req) => {
    console.info('[ipc] onboarding:complete-step (stub)', req)
    return { nextStep: null }
  })

  handleInvoke(Channels.PERMISSION_STATUS, null, () => {
    console.info('[ipc] permission:status (stub)')
    return { mic: false, accessibility: process.platform === 'darwin' ? false : null }
  })

  handleInvoke(Channels.PERMISSION_REQUEST_MIC, null, () => {
    console.info('[ipc] permission:request-mic (stub)')
    return { granted: false }
  })

  handleInvoke(Channels.UPDATER_CHECK, null, () => {
    console.info('[ipc] updater:check (stub)')
    return { hasUpdate: false }
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

  handleSend(Channels.HUD_CANCEL, null, () => {
    deps.onHudCancel()
  })

  handleSend(Channels.ONBOARDING_DONE, null, () => {
    console.info('[ipc] onboarding:done (stub)')
  })

  handleSend(Channels.PERMISSION_OPEN_SYSTEM_PREFS, PermissionOpenSystemPrefsSchema, (payload) => {
    console.info('[ipc] permission:open-system-prefs (stub)', payload)
  })
}
