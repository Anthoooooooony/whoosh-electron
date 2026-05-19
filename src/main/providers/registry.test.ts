// providerRegistry 测试 —— 验证「无需改 main / ipc 就能挂一个新 provider」
//
// 目标场景：第三方 dummy provider 拿到注册位之后，外层 lookup
// （main/index.ts 路径里的 getProviderEntry → entry.fromStore → entry.factory）
// 与 testConnection 分发路径都能直接走通，不再有任何按 id 的 if/else 兜底。

import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ASRCapabilities, ASRProvider, ASRStartOptions } from '@shared/types/provider.js'
import type { AppConfig } from '@shared/ipc/schemas.js'
import {
  __registerForTests,
  getProviderEntry,
  providerRegistry,
  type ProviderEntry,
  type TestConnectionResult,
} from './registry.js'

/* ───── 一个最小可用的 fake provider，足以让 factory 出活实例 ───── */
class FakeProvider extends EventEmitter implements ASRProvider {
  readonly id = 'fake'
  readonly capabilities: ASRCapabilities = { streaming: true, partialResults: true }
  readonly settingsSchema: Record<string, unknown> = {}
  readonly defaults: Record<string, unknown> = {}

  start = vi.fn(async (_opts: ASRStartOptions): Promise<void> => {})
  pushAudio = vi.fn((_chunk: Buffer): void => {})
  finish = vi.fn(async (): Promise<void> => {})
  abort = vi.fn((): void => {})
}

/** 一个 store 子配置最小形态 —— fake 只关心 apiKey 是否在；额外字段透传给 factory */
interface FakeStoreCfg {
  flavor?: string
}
interface FakeRuntimeCfg {
  apiKey: string
  flavor: string
}

function makeFakeEntry(): ProviderEntry<FakeStoreCfg, FakeRuntimeCfg> {
  return {
    id: 'fake',
    factory: vi.fn((_cfg: FakeRuntimeCfg): ASRProvider => new FakeProvider()),
    fromStore: vi.fn((store: AppConfig, apiKey: string | null): FakeRuntimeCfg | null => {
      if (!apiKey) return null
      const raw = (store.providers['fake'] ?? {}) as Record<string, unknown>
      const flavor = typeof raw['flavor'] === 'string' ? raw['flavor'] : 'default'
      return { apiKey, flavor }
    }),
    testConnection: vi.fn(
      async (_credentials): Promise<TestConnectionResult> => ({ ok: true, latencyMs: 7 }),
    ),
    configSchema: z.object({ flavor: z.string().optional() }) as z.ZodType<FakeStoreCfg>,
    missingCredentialsKey: 'provider.missingCredentials.fake',
  }
}

function makeStubStore(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    audio: { inputDeviceId: null },
    providers: { fake: { flavor: 'chocolate' } },
    currentProviderId: 'fake',
    behavior: { showHudWhenRecording: true, openAtLogin: false },
    logging: { verbose: false },
    ui: { locale: 'zh-CN' },
    onboarding: { completedSteps: [], done: false },
    ...overrides,
  }
}

describe('providerRegistry', () => {
  let unregister: (() => void) | null = null

  beforeEach(() => {
    unregister = null
  })
  afterEach(() => {
    unregister?.()
    unregister = null
  })

  describe('基线', () => {
    it('豆包 entry 默认注册', () => {
      // 不依赖任何手动注册：bb 维持「至少有一个生产 provider」的不变量
      const doubao = getProviderEntry('doubao')
      expect(doubao).toBeDefined()
      expect(doubao?.id).toBe('doubao')
    })

    it('未知 id → undefined（不抛）', () => {
      expect(getProviderEntry('nonexistent')).toBeUndefined()
    })
  })

  describe('挂新 provider', () => {
    it('注册 fake entry 后 getProviderEntry 命中', () => {
      const entry = makeFakeEntry()
      unregister = __registerForTests(entry)
      expect(getProviderEntry('fake')).toBe(entry)
      // 直接读 map 也可以 —— 保证 registry 不藏副本
      expect(providerRegistry['fake']).toBe(entry)
    })

    it('lookup → fromStore → factory 链路完整，无需修改 main/ipc', () => {
      const entry = makeFakeEntry()
      unregister = __registerForTests(entry)

      // 模拟 main/index.ts:makeCurrentProvider 的整条链
      const cfg = makeStubStore()
      const found = getProviderEntry(cfg.currentProviderId)!
      const runtime = found.fromStore(cfg, 'k1')
      expect(runtime).toEqual({ apiKey: 'k1', flavor: 'chocolate' })
      const inst = found.factory(runtime!)
      expect(inst).toBeInstanceOf(FakeProvider)
      expect(found.fromStore).toHaveBeenCalledWith(cfg, 'k1')
      expect(found.factory).toHaveBeenCalledWith(runtime)
    })

    it('fromStore 返 null（缺凭据）→ 调用方据此降级，不应走 factory', () => {
      const entry = makeFakeEntry()
      unregister = __registerForTests(entry)
      const cfg = makeStubStore()
      const runtime = entry.fromStore(cfg, null)
      expect(runtime).toBeNull()
      expect(entry.factory).not.toHaveBeenCalled()
    })

    it('testConnection 路径走 entry.testConnection，不经 if 链', async () => {
      const entry = makeFakeEntry()
      unregister = __registerForTests(entry)
      const found = getProviderEntry('fake')!
      const res = await found.testConnection({ apiKey: 'x' })
      expect(res).toEqual({ ok: true, latencyMs: 7 })
      expect(entry.testConnection).toHaveBeenCalledWith({ apiKey: 'x' })
    })

    it('configSchema 暴露在 entry 上，可供 renderer safeParse', () => {
      const entry = makeFakeEntry()
      unregister = __registerForTests(entry)
      const parsed = entry.configSchema.safeParse({ flavor: 'vanilla' })
      expect(parsed.success).toBe(true)
      if (parsed.success) expect(parsed.data.flavor).toBe('vanilla')
    })

    it('missingCredentialsKey 是 i18n key 而非文案', () => {
      const entry = makeFakeEntry()
      // 命名约定：provider.missingCredentials.<id>；不含中文/英文实文
      expect(entry.missingCredentialsKey).toMatch(/^provider\.missingCredentials\./)
    })

    it('重复注册同 id → 抛错（避免静默覆盖）', () => {
      const entry = makeFakeEntry()
      unregister = __registerForTests(entry)
      expect(() => __registerForTests(makeFakeEntry())).toThrow(/already registered/)
    })
  })
})
