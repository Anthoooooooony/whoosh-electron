// doubao registry-entry 的 fromStore 优先级测试 ——
// 验证 `.env`（dev override）优先于持久化 store，被 #53 registry 重构丢失的语义现已恢复。
//
// 测试策略：mock `@main/doubao-config.js` 暴露的 fromEnv/getEnv/fromStore，
// 让用例可以分别控制「env 命中」与「env 缺失」两条分支，确保 entry.fromStore
// 在 env 命中时直接返回 env config、不再读 store；env 缺失时回退到 store fromStore。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '@shared/ipc/schemas.js'
import type { DoubaoProviderConfig } from '@providers/doubao/index.js'

const mocks = vi.hoisted(() => ({
  fromEnv: vi.fn<(env: Record<string, string>) => DoubaoProviderConfig | null>(),
  getEnv: vi.fn<() => Record<string, string>>(),
  fromStore:
    vi.fn<(cfg: Record<string, unknown>, apiKey: string | null) => DoubaoProviderConfig | null>(),
  testDoubaoConnection: vi.fn(),
}))

vi.mock('@main/doubao-config.js', () => ({
  fromEnv: mocks.fromEnv,
  getEnv: mocks.getEnv,
  fromStore: mocks.fromStore,
  testDoubaoConnection: mocks.testDoubaoConnection,
}))

const { doubaoEntry } = await import('./registry-entry.js')

function makeStubStore(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    audio: { inputDeviceId: null },
    providers: { doubao: { resourceId: 'r-store' } },
    currentProviderId: 'doubao',
    behavior: { showHudWhenRecording: true, openAtLogin: false },
    logging: { verbose: false },
    ui: { locale: 'zh-CN' },
    onboarding: { completedSteps: [], done: false },
    ...overrides,
  }
}

describe('doubaoEntry.fromStore · env override 优先', () => {
  beforeEach(() => {
    mocks.fromEnv.mockReset()
    mocks.getEnv.mockReset()
    mocks.fromStore.mockReset()
    mocks.getEnv.mockReturnValue({ DOUBAO_API_KEY: 'env-key' })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('env 有凭据 → 直接返回 env config，不读 store', () => {
    const envConfig: DoubaoProviderConfig = { auth: { mode: 'new', apiKey: 'env-key' } }
    mocks.fromEnv.mockReturnValue(envConfig)

    const result = doubaoEntry.fromStore(makeStubStore(), 'store-key')

    expect(result).toEqual(envConfig)
    // 关键：env 命中后 fromStore（store 路径）绝不应被调用
    expect(mocks.fromStore).not.toHaveBeenCalled()
  })

  it('env 缺凭据 → 走 store fromStore，apiKey 透传', () => {
    mocks.fromEnv.mockReturnValue(null)
    const storeConfig: DoubaoProviderConfig = {
      auth: { mode: 'new', apiKey: 'store-key' },
      resourceId: 'r-store',
    }
    mocks.fromStore.mockReturnValue(storeConfig)

    const result = doubaoEntry.fromStore(makeStubStore(), 'store-key')

    expect(result).toEqual(storeConfig)
    expect(mocks.fromStore).toHaveBeenCalledWith({ resourceId: 'r-store' }, 'store-key')
  })

  it('env 缺、store 也缺 apiKey → null（调用方据此进 missingCredentials 路径）', () => {
    mocks.fromEnv.mockReturnValue(null)
    mocks.fromStore.mockReturnValue(null)

    const result = doubaoEntry.fromStore(makeStubStore(), null)

    expect(result).toBeNull()
  })
})
