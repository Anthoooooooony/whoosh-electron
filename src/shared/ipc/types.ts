// IPC contract 类型 —— 从 schemas 推导，按 direction 分组
//
// InvokeContract:    renderer ↔ main 请求/响应
// SendContract:      renderer → main 单向
// BroadcastContract: main → renderer(s) 单向

import type { z } from 'zod'
import { Channels } from './channels.js'
import {
  AppConfigSchema,
  AudioCaptureEndedSchema,
  AudioChunkSchema,
  AudioStartSchema,
  DeviceListSchema,
  HudShowSchema,
  OnboardingCompleteStepRequestSchema,
  OnboardingCompleteStepResponseSchema,
  OnboardingGetStepResponseSchema,
  PermissionOpenSystemPrefsSchema,
  PermissionRequestMicResponseSchema,
  PermissionStatusResponseSchema,
  ProviderTestConnectionRequestSchema,
  ProviderTestConnectionResponseSchema,
  SessionErrorSchema,
  SessionFinalSchema,
  SessionPartialSchema,
  SetDeviceSchema,
  SettingsGetApikeyResultSchema,
  SettingsGetApikeySchema,
  SettingsSetApikeyResultSchema,
  SettingsSetApikeySchema,
  SettingsSetSchema,
  UpdaterCheckResponseSchema,
  UpdaterNewVersionSchema,
} from './schemas.js'

// ───────────────────────────────────────────
// invoke contracts: { req, res }
// ───────────────────────────────────────────
export interface InvokeContract {
  [Channels.AUDIO_DEVICE_LIST]: {
    req: void
    res: z.infer<typeof DeviceListSchema>
  }

  [Channels.SETTINGS_GET]: {
    req: void
    res: z.infer<typeof AppConfigSchema>
  }
  [Channels.SETTINGS_SET]: {
    req: z.infer<typeof SettingsSetSchema>
    res: z.infer<typeof AppConfigSchema>
  }
  [Channels.SETTINGS_GET_APIKEY]: {
    req: z.infer<typeof SettingsGetApikeySchema>
    res: z.infer<typeof SettingsGetApikeyResultSchema>
  }
  [Channels.SETTINGS_SET_APIKEY]: {
    req: z.infer<typeof SettingsSetApikeySchema>
    res: z.infer<typeof SettingsSetApikeyResultSchema>
  }

  [Channels.PROVIDER_TEST_CONNECTION]: {
    req: z.infer<typeof ProviderTestConnectionRequestSchema>
    res: z.infer<typeof ProviderTestConnectionResponseSchema>
  }

  [Channels.ONBOARDING_GET_STEP]: {
    req: void
    res: z.infer<typeof OnboardingGetStepResponseSchema>
  }
  [Channels.ONBOARDING_COMPLETE_STEP]: {
    req: z.infer<typeof OnboardingCompleteStepRequestSchema>
    res: z.infer<typeof OnboardingCompleteStepResponseSchema>
  }

  [Channels.PERMISSION_STATUS]: {
    req: void
    res: z.infer<typeof PermissionStatusResponseSchema>
  }
  [Channels.PERMISSION_REQUEST_MIC]: {
    req: void
    res: z.infer<typeof PermissionRequestMicResponseSchema>
  }

  [Channels.UPDATER_CHECK]: {
    req: void
    res: z.infer<typeof UpdaterCheckResponseSchema>
  }
}

// ───────────────────────────────────────────
// send contracts: payload only
// ───────────────────────────────────────────
export interface SendContract {
  [Channels.AUDIO_CHUNK]: z.infer<typeof AudioChunkSchema>
  [Channels.AUDIO_SET_DEVICE]: z.infer<typeof SetDeviceSchema>
  [Channels.AUDIO_CAPTURE_ENDED]: z.infer<typeof AudioCaptureEndedSchema>
  [Channels.HUD_CANCEL]: void
  [Channels.ONBOARDING_DONE]: void
  [Channels.PERMISSION_OPEN_SYSTEM_PREFS]: z.infer<typeof PermissionOpenSystemPrefsSchema>
  [Channels.APP_RELAUNCH]: void
}

// ───────────────────────────────────────────
// broadcast contracts: main → renderer(s)
// ───────────────────────────────────────────
export interface BroadcastContract {
  [Channels.AUDIO_START]: z.infer<typeof AudioStartSchema>
  [Channels.AUDIO_STOP]: void
  [Channels.AUDIO_ABORT]: void

  [Channels.SESSION_PARTIAL]: z.infer<typeof SessionPartialSchema>
  [Channels.SESSION_FINAL]: z.infer<typeof SessionFinalSchema>
  [Channels.SESSION_ERROR]: z.infer<typeof SessionErrorSchema>

  [Channels.HUD_SHOW]: z.infer<typeof HudShowSchema>
  [Channels.HUD_HIDE]: void

  [Channels.UPDATER_NEW_VERSION]: z.infer<typeof UpdaterNewVersionSchema>
}

// ───────────────────────────────────────────
// renderer 侧 window.ipc 的形状
// ───────────────────────────────────────────
export interface IpcApi {
  invoke<C extends keyof InvokeContract>(
    channel: C,
    ...args: InvokeContract[C]['req'] extends void ? [] : [InvokeContract[C]['req']]
  ): Promise<InvokeContract[C]['res']>

  send<C extends keyof SendContract>(
    channel: C,
    ...args: SendContract[C] extends void ? [] : [SendContract[C]]
  ): void

  on<C extends keyof BroadcastContract>(
    channel: C,
    handler: (
      payload: BroadcastContract[C] extends void ? undefined : BroadcastContract[C],
    ) => void,
  ): () => void
}
