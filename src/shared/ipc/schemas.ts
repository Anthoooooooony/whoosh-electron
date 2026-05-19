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
// providerId 之前 z.enum(['doubao'])，加 provider 要回头改 schema。
// 改成 string + min(1)：registry 是注册表的运行期单一来源，schema 只把它当不透明 id。
// 越界 id 会在 main 端经 getProviderEntry 失败 → ipc 返回 provider-not-registered。
export const ProviderIdSchema = z.string().min(1)

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
// i18nKey：main 进程不直接调 t()（避免在 main 启用 i18next 增大启动面），
// 改成把 i18n key 透传给 renderer。renderer 优先 t(i18nKey)，回退到 message。
// message 仍保留 —— provider 内部抛出的英文/技术错误以原文经此通道流到 HUD。
export const SessionErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  i18nKey: z.string().optional(),
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
// safeStorage 不可用时 main 端拒绝写入，renderer 据此弹错并保留输入内容。
export const SettingsSetApikeyResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.enum(['encryption-unavailable']) }),
])

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
