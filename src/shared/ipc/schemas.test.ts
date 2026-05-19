import { describe, expect, it } from 'vitest'
import {
  AudioCaptureEndedSchema,
  AudioChunkSchema,
  HudStateSchema,
  OnboardingGetStepResponseSchema,
  ProviderTestConnectionRequestSchema,
  SessionErrorSchema,
  SettingsSetApikeySchema,
  UpdaterCheckResponseSchema,
} from './schemas.js'

describe('IPC schemas', () => {
  describe('AudioChunkSchema', () => {
    it('accepts valid Uint8Array + timestamp', () => {
      const result = AudioChunkSchema.safeParse({
        chunk: new Uint8Array([1, 2, 3]),
        timestamp: 1700000000,
      })
      expect(result.success).toBe(true)
    })

    it('rejects plain array as chunk', () => {
      const result = AudioChunkSchema.safeParse({
        chunk: [1, 2, 3],
        timestamp: 0,
      })
      expect(result.success).toBe(false)
    })

    it('rejects negative timestamp', () => {
      const result = AudioChunkSchema.safeParse({
        chunk: new Uint8Array(),
        timestamp: -1,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('AudioCaptureEndedSchema', () => {
    it('accepts { reason: "mic-lost" }', () => {
      expect(AudioCaptureEndedSchema.safeParse({ reason: 'mic-lost' }).success).toBe(true)
    })

    it('rejects unknown reason', () => {
      expect(AudioCaptureEndedSchema.safeParse({ reason: 'whatever' }).success).toBe(false)
    })

    it('rejects missing reason', () => {
      expect(AudioCaptureEndedSchema.safeParse({}).success).toBe(false)
    })
  })

  describe('HudStateSchema', () => {
    it.each(['recording', 'hover', 'processing', 'error'] as const)('accepts %s', (state) => {
      expect(HudStateSchema.parse(state)).toBe(state)
    })

    it('rejects unknown state', () => {
      expect(HudStateSchema.safeParse('unknown').success).toBe(false)
    })
  })

  describe('SessionErrorSchema', () => {
    it('requires code from enum', () => {
      const ok = SessionErrorSchema.safeParse({
        code: 'NETWORK_ERROR',
        message: 'offline',
      })
      expect(ok.success).toBe(true)

      const bad = SessionErrorSchema.safeParse({
        code: 'TOTALLY_FAKE',
        message: 'x',
      })
      expect(bad.success).toBe(false)
    })
  })

  describe('SettingsSetApikeySchema', () => {
    it('accepts well-formed payload', () => {
      const result = SettingsSetApikeySchema.safeParse({
        providerId: 'doubao',
        key: 'xxxx',
      })
      expect(result.success).toBe(true)
    })

    // providerId 在 schema 层退化为不透明 string；未知 id 的拒绝迁到了 IPC handler
    // 通过 providerRegistry lookup 完成（见 main/providers/registry.test.ts）。
    it('accepts arbitrary providerId string (gating moved to registry lookup)', () => {
      const result = SettingsSetApikeySchema.safeParse({
        providerId: 'whisper',
        key: 'xxx',
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty providerId', () => {
      const result = SettingsSetApikeySchema.safeParse({
        providerId: '',
        key: 'xxx',
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing key', () => {
      const result = SettingsSetApikeySchema.safeParse({
        providerId: 'doubao',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('ProviderTestConnectionRequestSchema', () => {
    it('accepts arbitrary credentials object', () => {
      const result = ProviderTestConnectionRequestSchema.safeParse({
        providerId: 'doubao',
        credentials: {
          appId: '1827495610',
          accessToken: 'VCsBYr_...',
          resourceId: 'volc.bigasr.sauc.duration',
        },
      })
      expect(result.success).toBe(true)
    })

    it('rejects null credentials', () => {
      const result = ProviderTestConnectionRequestSchema.safeParse({
        providerId: 'doubao',
        credentials: null,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('OnboardingGetStepResponseSchema', () => {
    it('accepts step 1-4 with valid platform', () => {
      for (const step of [1, 2, 3, 4] as const) {
        const result = OnboardingGetStepResponseSchema.safeParse({
          step,
          platform: 'darwin',
        })
        expect(result.success).toBe(true)
      }
    })

    it('rejects step 0 / 5', () => {
      expect(
        OnboardingGetStepResponseSchema.safeParse({ step: 0, platform: 'darwin' }).success,
      ).toBe(false)
      expect(
        OnboardingGetStepResponseSchema.safeParse({ step: 5, platform: 'darwin' }).success,
      ).toBe(false)
    })
  })

  describe('UpdaterCheckResponseSchema', () => {
    it('accepts hasUpdate=false without version', () => {
      const result = UpdaterCheckResponseSchema.safeParse({ hasUpdate: false })
      expect(result.success).toBe(true)
    })

    it('accepts hasUpdate=true with valid url', () => {
      const result = UpdaterCheckResponseSchema.safeParse({
        hasUpdate: true,
        version: '0.1.1',
        url: 'https://github.com/Anthoooooooony/whoosh-electron/releases/tag/v0.1.1',
      })
      expect(result.success).toBe(true)
    })

    it('rejects malformed url', () => {
      const result = UpdaterCheckResponseSchema.safeParse({
        hasUpdate: true,
        version: '0.1.1',
        url: 'not-a-url',
      })
      expect(result.success).toBe(false)
    })
  })
})
