// 存储层 —— electron-store 存非敏感配置，safeStorage 存 API key
//
// 设计：
//   - AppConfigSchema 由 shared/ipc/schemas.ts 定义；store 用同一份 schema 做 runtime 校验
//   - safeStorage 走 macOS Keychain / Windows DPAPI；key 名按 provider id 区分
//   - 提供一份 typed API：getConfig / setConfig (partial) / getApiKey / setApiKey

import { safeStorage } from 'electron'
import ElectronStore from 'electron-store'
import { AppConfigSchema, type AppConfig } from '@shared/ipc/schemas.js'

export type { AppConfig }

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
  apiKeys: Record<string, string> // 加密值带 ENCRYPTED_PREFIX；无前缀视为遗留明文
}

// 持久化的密文都带版本化前缀；读路径据此区分明文遗留条目 vs 加密条目，
// 避免根据长度 / base64 形态做脆弱启发式判断。
const ENCRYPTED_PREFIX = 'enc:v1:'

function isEncryptedEntry(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX)
}

export type SetApiKeyResult = { ok: true } | { ok: false; reason: 'encryption-unavailable' }

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

/**
 * 热路径专用：读 logging.verbose 时跳过整 schema 的 zod safeParse 开销。
 * partial 帧 5-10 次/秒 调用 debugTranscript，全 schema 校验在此场景下过重。
 * electron-store 的 dot-notation get 直接拿持久化 raw 值；缺失或非布尔时回落到 false。
 * 不做模块级缓存，让 toggle 切换立刻生效，与 setConfig 写入语义一致。
 */
export function isVerboseLoggingEnabled(): boolean {
  return store().get('config.logging.verbose', false) === true
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
  const entry = store().get('apiKeys')?.[providerId]
  if (!entry) return null

  if (isEncryptedEntry(entry)) {
    const b64 = entry.slice(ENCRYPTED_PREFIX.length)
    try {
      return safeStorage.decryptString(Buffer.from(b64, 'base64'))
    } catch (err) {
      console.error('[store] failed to decrypt api key', err)
      return null
    }
  }

  // 遗留明文条目：safeStorage 已就绪则原地迁移到密文并落盘；否则只读取不写。
  // 迁移路径是幂等的：迁移完成后下一次 get 命中加密分支。
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const cipher = ENCRYPTED_PREFIX + safeStorage.encryptString(entry).toString('base64')
      const apiKeys = { ...(store().get('apiKeys') ?? {}) }
      apiKeys[providerId] = cipher
      store().set('apiKeys', apiKeys)
    } catch (err) {
      console.error('[store] failed to migrate plaintext api key', err)
    }
  }
  return entry
}

export function setApiKey(providerId: string, key: string): SetApiKeyResult {
  const apiKeys = { ...(store().get('apiKeys') ?? {}) }
  if (key === '') {
    // 删除操作不依赖 safeStorage 可用，永远允许。
    delete apiKeys[providerId]
    store().set('apiKeys', apiKeys)
    return { ok: true }
  }
  if (!safeStorage.isEncryptionAvailable()) {
    // 拒绝明文落盘 —— 同用户进程可直接读 electron-store JSON。
    // 调用方负责把 reason 透给 UI 让用户处理（如装好 keyring 后重试）。
    return { ok: false, reason: 'encryption-unavailable' }
  }
  apiKeys[providerId] = ENCRYPTED_PREFIX + safeStorage.encryptString(key).toString('base64')
  store().set('apiKeys', apiKeys)
  return { ok: true }
}

/* ───── helpers ───── */

export function resetForTests(): void {
  // 测试入口，生产代码不应调用
  storeInstance = null
}
