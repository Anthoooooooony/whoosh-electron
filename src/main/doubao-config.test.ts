// doubao-config 的纯塑形函数（internal seam）测试 —— 覆盖 env/store 凭据的
// 分支、字段白名单、auth 模式塑形。resolveDoubaoConfig 读真实 .env+store，不在此测。

import { describe, expect, it } from 'vitest'
import { doubaoConfigFromCredentials, fromEnv, fromStore } from './doubao-config.js'

describe('doubao-config', () => {
  describe('fromEnv', () => {
    it('DOUBAO_API_KEY → new-mode config', () => {
      expect(fromEnv({ DOUBAO_API_KEY: 'k1' })).toEqual({ auth: { mode: 'new', apiKey: 'k1' } })
    })

    it('DOUBAO_APP_KEY + DOUBAO_ACCESS_KEY → old-mode config', () => {
      expect(fromEnv({ DOUBAO_APP_KEY: 'app', DOUBAO_ACCESS_KEY: 'acc' })).toEqual({
        auth: { mode: 'old', appKey: 'app', accessKey: 'acc' },
      })
    })

    it('apiKey 优先：apiKey 与 app/access 都给时走 new-mode', () => {
      const c = fromEnv({
        DOUBAO_API_KEY: 'k1',
        DOUBAO_APP_KEY: 'app',
        DOUBAO_ACCESS_KEY: 'acc',
      })
      expect(c?.auth).toEqual({ mode: 'new', apiKey: 'k1' })
    })

    it('半套旧凭据（只有 appKey、缺 accessKey）→ null', () => {
      expect(fromEnv({ DOUBAO_APP_KEY: 'app' })).toBeNull()
    })

    it('无任何凭据 → null', () => {
      expect(fromEnv({})).toBeNull()
    })

    it('透传 resourceId / endpointKey', () => {
      const c = fromEnv({
        DOUBAO_API_KEY: 'k1',
        DOUBAO_RESOURCE_ID: 'res-x',
        DOUBAO_ENDPOINT_KEY: 'bigmodel',
      })
      expect(c?.resourceId).toBe('res-x')
      expect(c?.endpointKey).toBe('bigmodel')
    })
  })

  describe('fromStore', () => {
    it('apiKey 为 null → null', () => {
      expect(fromStore({ resourceId: 'r' }, null)).toBeNull()
    })

    it('有 apiKey → new-mode config', () => {
      expect(fromStore({}, 'k1')).toEqual({ auth: { mode: 'new', apiKey: 'k1' } })
    })

    it('透传 string 型 resourceId / endpointKey', () => {
      const c = fromStore({ resourceId: 'r', endpointKey: 'bigmodel' }, 'k1')
      expect(c?.resourceId).toBe('r')
      expect(c?.endpointKey).toBe('bigmodel')
    })

    it('非 string 的 resourceId 被忽略', () => {
      const c = fromStore({ resourceId: 123 }, 'k1')
      expect(c?.resourceId).toBeUndefined()
    })

    it('request 字段白名单：已知键透传、未知键丢弃、falsy 但 defined 的值保留', () => {
      const c = fromStore({ language: 'en-US', enable_punc: false, garbage: 'x' }, 'k1')
      expect(c?.request).toEqual({ language: 'en-US', enable_punc: false })
    })

    it('无任何 request 字段 → 不带 request 键', () => {
      const c = fromStore({}, 'k1')
      expect(c?.request).toBeUndefined()
    })
  })

  describe('doubaoConfigFromCredentials', () => {
    it('有 apiKey → new-mode config', () => {
      expect(doubaoConfigFromCredentials({ apiKey: 'k1' })).toEqual({
        auth: { mode: 'new', apiKey: 'k1' },
      })
    })

    it('apiKey + resourceId → 带 resourceId', () => {
      const c = doubaoConfigFromCredentials({ apiKey: 'k1', resourceId: 'r' })
      expect(c?.resourceId).toBe('r')
    })

    it('缺 apiKey → null', () => {
      expect(doubaoConfigFromCredentials({ resourceId: 'r' })).toBeNull()
    })

    it('apiKey 非 string → null', () => {
      expect(doubaoConfigFromCredentials({ apiKey: 12345 })).toBeNull()
    })
  })
})
