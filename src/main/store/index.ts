// 存储层 —— electron-store 存非敏感配置，safeStorage 存 API key
//
// 设计：
//   - AppConfigSchema 由 shared/ipc/schemas.ts 定义；store 用同一份 schema 做 runtime 校验
//   - safeStorage 走 macOS Keychain / Windows DPAPI；key 名按 provider id 区分
//   - 提供一份 typed API：getConfig / setConfig (partial) / getApiKey / setApiKey

import { safeStorage } from 'electron'
import ElectronStore from 'electron-store'
import { z } from 'zod'
import { AppConfigSchema } from '@shared/ipc/schemas.js'

export type AppConfig = z.infer<typeof AppConfigSchema>

/**
 * AppConfigPatch —— 部分更新；exactOptionalPropertyTypes 下需要显式允许 undefined，
 * 因为 zod .partial() 推导出的可选字段是 'T | undefined' 而不是 'T?'
 */
export type AppConfigPatch = {
  [K in keyof AppConfig]?: AppConfig[K] | undefined
}

const DEFAULT_CONFIG: AppConfig = {
  audio: { inputDeviceId: null },
  providers: {
    doubao: {
      resourceId: 'volc.seedasr.sauc.duration',
      endpointKey: 'bigmodel_async',
      authMode: 'new',
      // request-level defaults
      enable_punc: true,
      enable_itn: true,
      enable_ddc: false,
      language: 'zh-CN',
    },
  },
  currentProviderId: 'doubao',
  behavior: {
    showHudWhenRecording: true,
    openAtLogin: false,
  },
  logging: {
    verbose: false,
  },
  ui: {
    locale: 'zh-CN',
  },
  onboarding: {
    completedSteps: [],
    done: false,
  },
}

interface StoreSchema {
  config: AppConfig
  apiKeys: Record<string, string> // ciphertext base64; safeStorage 加密
}

let storeInstance: ElectronStore<StoreSchema> | null = null

function store(): ElectronStore<StoreSchema> {
  if (!storeInstance) {
    storeInstance = new ElectronStore<StoreSchema>({
      defaults: { config: DEFAULT_CONFIG, apiKeys: {} },
      // schema 校验在读取时手动做，写入时由 setConfig 限制
    })
  }
  return storeInstance
}

/* ───── config ───── */

export function getConfig(): AppConfig {
  const raw = store().get('config')
  const parsed = AppConfigSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  // schema 失配（旧版本迁移）—— fallback 到默认 + 合并
  console.warn('[store] config schema mismatch, using defaults', parsed.error.issues)
  return DEFAULT_CONFIG
}

export function setConfig(patch: AppConfigPatch): AppConfig {
  const current = getConfig()
  // 显式按 key 合并，避免 spread 把 undefined 字段污染回 current（exactOptionalPropertyTypes）
  const next: AppConfig = {
    audio: { ...current.audio, ...(patch.audio ?? {}) },
    behavior: { ...current.behavior, ...(patch.behavior ?? {}) },
    logging: { ...current.logging, ...(patch.logging ?? {}) },
    ui: { ...current.ui, ...(patch.ui ?? {}) },
    onboarding: { ...current.onboarding, ...(patch.onboarding ?? {}) },
    providers: { ...current.providers, ...(patch.providers ?? {}) },
    currentProviderId: patch.currentProviderId ?? current.currentProviderId,
  }
  store().set('config', next)
  return next
}

/* ───── api keys (encrypted with safeStorage) ───── */

export function getApiKey(providerId: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    // OS 不支持加密时 fallback 到明文（开发环境 Linux 等场景）
    const plain = store().get('apiKeys')?.[providerId]
    return plain ?? null
  }
  const buf = store().get('apiKeys')?.[providerId]
  if (!buf) return null
  try {
    return safeStorage.decryptString(Buffer.from(buf, 'base64'))
  } catch (err) {
    console.error('[store] failed to decrypt api key', err)
    return null
  }
}

export function setApiKey(providerId: string, key: string): void {
  const apiKeys = { ...(store().get('apiKeys') ?? {}) }
  if (key === '') {
    delete apiKeys[providerId]
  } else if (safeStorage.isEncryptionAvailable()) {
    apiKeys[providerId] = safeStorage.encryptString(key).toString('base64')
  } else {
    apiKeys[providerId] = key
  }
  store().set('apiKeys', apiKeys)
}

/* ───── helpers ───── */

export function resetForTests(): void {
  // 测试入口，生产代码不应调用
  storeInstance = null
}
