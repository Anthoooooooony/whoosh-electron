// store.test.ts —— 覆盖 #51 修复：safeStorage 不可用时拒绝写明文 + 已就绪时自动迁移遗留明文条目。
//
// 通过 vi.mock 替掉 electron 的 safeStorage 与 electron-store。in-memory store
// 直接持有一个 Map<key, unknown>，断言走 store 状态 + 函数返回值。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const memory = vi.hoisted(() => ({ data: new Map<string, unknown>() }))

vi.mock('electron-store', () => {
  class FakeStore {
    constructor(opts: { defaults: Record<string, unknown> }) {
      for (const [k, v] of Object.entries(opts.defaults ?? {})) {
        if (!memory.data.has(k)) memory.data.set(k, v)
      }
    }
    get(key: string): unknown {
      return memory.data.get(key)
    }
    set(key: string, value: unknown): void {
      memory.data.set(key, value)
    }
  }
  return { default: FakeStore }
})

const safeStorageMock = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn<() => boolean>(() => true),
  encryptString: vi.fn<(s: string) => Buffer>((s) => Buffer.from(`CIPHER(${s})`, 'utf-8')),
  decryptString: vi.fn<(b: Buffer) => string>((b) => {
    const s = b.toString('utf-8')
    const m = /^CIPHER\((.*)\)$/.exec(s)
    if (!m) throw new Error('cannot decrypt non-CIPHER blob')
    return m[1] ?? ''
  }),
}))

vi.mock('electron', () => ({ safeStorage: safeStorageMock }))

const { getApiKey, setApiKey, resetForTests } = await import('./index.js')

const ENCRYPTED_PREFIX = 'enc:v1:'

describe('store · api key persistence (#51)', () => {
  beforeEach(() => {
    memory.data.clear()
    resetForTests()
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
    safeStorageMock.encryptString.mockClear()
    safeStorageMock.decryptString.mockClear()
  })

  afterEach(() => {
    memory.data.clear()
  })

  describe('setApiKey', () => {
    it('safeStorage 可用 → 加密后写入并返回 ok', () => {
      const result = setApiKey('doubao', 'secret-uuid')
      expect(result).toEqual({ ok: true })

      const stored = (memory.data.get('apiKeys') as Record<string, string>)['doubao']
      expect(stored).toBeDefined()
      expect(stored!.startsWith(ENCRYPTED_PREFIX)).toBe(true)
      expect(stored).not.toContain('secret-uuid')
    })

    it('safeStorage 不可用 → 拒绝写入并返回 reason', () => {
      safeStorageMock.isEncryptionAvailable.mockReturnValue(false)

      const result = setApiKey('doubao', 'secret-uuid')
      expect(result).toEqual({ ok: false, reason: 'encryption-unavailable' })

      const stored = (memory.data.get('apiKeys') as Record<string, string> | undefined)?.['doubao']
      expect(stored).toBeUndefined()
    })

    it('safeStorage 不可用时即使有遗留明文也不会被覆盖（不静默升级）', () => {
      memory.data.set('apiKeys', { doubao: 'legacy-plaintext' })
      safeStorageMock.isEncryptionAvailable.mockReturnValue(false)

      const result = setApiKey('doubao', 'new-secret')
      expect(result).toEqual({ ok: false, reason: 'encryption-unavailable' })
      expect((memory.data.get('apiKeys') as Record<string, string>)['doubao']).toBe(
        'legacy-plaintext',
      )
    })

    it('空 key 即使 safeStorage 不可用也允许（视作删除）', () => {
      memory.data.set('apiKeys', { doubao: `${ENCRYPTED_PREFIX}xxx` })
      safeStorageMock.isEncryptionAvailable.mockReturnValue(false)

      const result = setApiKey('doubao', '')
      expect(result).toEqual({ ok: true })
      expect((memory.data.get('apiKeys') as Record<string, string>)['doubao']).toBeUndefined()
    })
  })

  describe('getApiKey', () => {
    it('返回 null 当条目不存在', () => {
      expect(getApiKey('doubao')).toBeNull()
    })

    it('加密路径：解密成功并返回明文，不退化', () => {
      setApiKey('doubao', 'round-trip')
      expect(getApiKey('doubao')).toBe('round-trip')
    })

    it('遗留明文 + safeStorage 可用 → 触发一次迁移，磁盘上明文消失', () => {
      memory.data.set('apiKeys', { doubao: 'legacy-plaintext' })
      safeStorageMock.isEncryptionAvailable.mockReturnValue(true)

      const first = getApiKey('doubao')
      expect(first).toBe('legacy-plaintext')

      const afterMigrate = (memory.data.get('apiKeys') as Record<string, string>)['doubao']
      expect(afterMigrate!.startsWith(ENCRYPTED_PREFIX)).toBe(true)
      expect(afterMigrate).not.toContain('legacy-plaintext')

      // 幂等：第二次读不再触发额外加密
      const encryptCallsAfterFirst = safeStorageMock.encryptString.mock.calls.length
      const second = getApiKey('doubao')
      expect(second).toBe('legacy-plaintext')
      expect(safeStorageMock.encryptString.mock.calls.length).toBe(encryptCallsAfterFirst)
    })

    it('遗留明文 + safeStorage 不可用 → 仍返回明文但不修改磁盘（避免破坏数据）', () => {
      memory.data.set('apiKeys', { doubao: 'legacy-plaintext' })
      safeStorageMock.isEncryptionAvailable.mockReturnValue(false)

      const value = getApiKey('doubao')
      expect(value).toBe('legacy-plaintext')
      expect((memory.data.get('apiKeys') as Record<string, string>)['doubao']).toBe(
        'legacy-plaintext',
      )
      expect(safeStorageMock.encryptString).not.toHaveBeenCalled()
    })

    it('加密条目解密失败时返回 null（错误隔离）', () => {
      memory.data.set('apiKeys', { doubao: `${ENCRYPTED_PREFIX}bm90LXZhbGlk` })
      safeStorageMock.decryptString.mockImplementationOnce(() => {
        throw new Error('boom')
      })
      expect(getApiKey('doubao')).toBeNull()
    })
  })
})
