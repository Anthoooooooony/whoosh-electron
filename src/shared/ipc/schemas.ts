// 所有 IPC channel 的 zod schema —— 双端 runtime 校验
// Channel 名 → schemas 由 contract 对象（types.ts 中导出）按 direction 组合

import { z } from 'zod'

// ───────────────────────────────────────────
// 基础类型
// ───────────────────────────────────────────
export const PlatformSchema = z.enum(['darwin', 'win32', 'linux'])
export const HudStateSchema = z.enum(['recording', 'hover', 'processing', 'error'])
export const ErrorCodeSchema = z.enum([
  'NETWORK_ERROR',
  'PROVIDER_AUTH',
  'PROVIDER_QUOTA',
  'MIC_PERMISSION',
  'DURATION_TOO_SHORT',
  'UNKNOWN',
])
export const ProviderIdSchema = z.enum(['doubao']) // v1 单 provider；扩展时加 enum 值

// ───────────────────────────────────────────
// audio:*
// ───────────────────────────────────────────
export const AudioChunkSchema = z.object({
  chunk: z.instanceof(Uint8Array),
  timestamp: z.number().int().nonnegative(),
})

export const DeviceListItemSchema = z.object({
  deviceId: z.string(),
  label: z.string(),
})
export const DeviceListSchema = z.array(DeviceListItemSchema)

export const SetDeviceSchema = z.object({
  deviceId: z.string().nullable(),
})

export const AudioStartSchema = z.object({
  deviceId: z.string().nullable(),
})

// ───────────────────────────────────────────
// session:*
// ───────────────────────────────────────────
export const SessionPartialSchema = z.object({
  text: z.string(),
})
export const SessionFinalSchema = z.object({
  text: z.string(),
  durationMs: z.number().int().nonnegative(),
})
export const SessionErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
})

// ───────────────────────────────────────────
// hud:*
// ───────────────────────────────────────────
export const HudShowSchema = z.object({
  state: HudStateSchema,
})

// ───────────────────────────────────────────
// settings:*
// ───────────────────────────────────────────
export const AppConfigSchema = z.object({
  audio: z.object({
    inputDeviceId: z.string().nullable(),
    inputDeviceLabel: z.string().optional(),
  }),
  providers: z.record(z.string(), z.record(z.string(), z.unknown())),
  currentProviderId: ProviderIdSchema,
  behavior: z.object({
    showHudWhenRecording: z.boolean(),
    openAtLogin: z.boolean(),
  }),
  logging: z.object({
    verbose: z.boolean(),
  }),
  ui: z.object({
    locale: z.enum(['zh-CN', 'en']),
  }),
  onboarding: z.object({
    completedSteps: z.array(z.string()),
    done: z.boolean(),
  }),
})

export type AppConfig = z.infer<typeof AppConfigSchema>

export const SettingsSetSchema = AppConfigSchema.partial()

export const SettingsGetApikeySchema = z.object({
  providerId: ProviderIdSchema,
})
export const SettingsGetApikeyResultSchema = z.object({
  key: z.string().nullable(),
})
export const SettingsSetApikeySchema = z.object({
  providerId: ProviderIdSchema,
  key: z.string(),
})

// ───────────────────────────────────────────
// provider:*
// ───────────────────────────────────────────
export const ProviderTestConnectionRequestSchema = z.object({
  providerId: ProviderIdSchema,
  credentials: z.record(z.string(), z.unknown()),
})
export const ProviderTestConnectionResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
})

// ───────────────────────────────────────────
// onboarding:*
// ───────────────────────────────────────────
export const OnboardingStepNumberSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
])
export const OnboardingGetStepResponseSchema = z.object({
  step: OnboardingStepNumberSchema,
  platform: PlatformSchema,
})
export const OnboardingCompleteStepRequestSchema = z.object({
  step: OnboardingStepNumberSchema,
})
export const OnboardingCompleteStepResponseSchema = z.object({
  nextStep: OnboardingStepNumberSchema.nullable(),
})

// ───────────────────────────────────────────
// permission:*
// ───────────────────────────────────────────
export const PermissionStatusResponseSchema = z.object({
  mic: z.boolean(),
  accessibility: z.boolean().nullable(), // null = N/A (Windows)
})
export const PermissionRequestMicResponseSchema = z.object({
  granted: z.boolean(),
})
export const PermissionOpenSystemPrefsSchema = z.object({
  pane: z.enum(['accessibility', 'microphone']),
})

// ───────────────────────────────────────────
// updater:*
// ───────────────────────────────────────────
export const UpdaterCheckResponseSchema = z.object({
  hasUpdate: z.boolean(),
  version: z.string().optional(),
  url: z.url().optional(),
})
export const UpdaterNewVersionSchema = z.object({
  version: z.string(),
  url: z.url(),
})
