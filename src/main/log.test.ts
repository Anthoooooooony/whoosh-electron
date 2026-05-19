// debugTranscript 测试 —— 守住「verbose=false 时零 console 输出」的隐私底线
//
// 通过 vi.mock 替换 ./store/index.js 的 getConfig 实现，避免触达真实 electron-store。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '@shared/ipc/schemas.js'

const getConfigMock = vi.fn<() => AppConfig>()

vi.mock('./store/index.js', () => ({
  getConfig: (): AppConfig => getConfigMock(),
}))

function makeConfig(verbose: boolean): AppConfig {
  return {
    audio: { inputDeviceId: null },
    providers: {},
    currentProviderId: 'doubao',
    behavior: { showHudWhenRecording: true, openAtLogin: false },
    logging: { verbose },
    ui: { locale: 'zh-CN' },
    onboarding: { completedSteps: [], done: false },
  }
}

describe('debugTranscript', () => {
  beforeEach(() => {
    vi.resetModules()
    getConfigMock.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('verbose=false → no-op；console.debug 不被调用', async () => {
    getConfigMock.mockReturnValue(makeConfig(false))
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { debugTranscript } = await import('./log.js')

    debugTranscript('partial', { text: '你好' })
    debugTranscript('final', { text: '你好世界', durationMs: 1200 })

    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('verbose=true → 真写 console.debug，带 label + fields', async () => {
    getConfigMock.mockReturnValue(makeConfig(true))
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { debugTranscript } = await import('./log.js')

    debugTranscript('partial', { text: '你好' })
    debugTranscript('final', { text: '你好世界', durationMs: 1200 })

    expect(debugSpy).toHaveBeenCalledTimes(2)
    expect(debugSpy).toHaveBeenNthCalledWith(1, '[transcript]', 'partial', { text: '你好' })
    expect(debugSpy).toHaveBeenNthCalledWith(2, '[transcript]', 'final', {
      text: '你好世界',
      durationMs: 1200,
    })
  })

  it('toggle 后续切换立即生效（每次调 getConfig，不缓存）', async () => {
    // 起始 off → 切到 on → 再切回 off；同一个 debugTranscript 引用三次调用的行为必须严格跟随 store
    getConfigMock.mockReturnValueOnce(makeConfig(false))
    getConfigMock.mockReturnValueOnce(makeConfig(true))
    getConfigMock.mockReturnValueOnce(makeConfig(false))
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { debugTranscript } = await import('./log.js')

    debugTranscript('partial', { text: 'a' })
    debugTranscript('partial', { text: 'b' })
    debugTranscript('partial', { text: 'c' })

    expect(debugSpy).toHaveBeenCalledTimes(1)
    expect(debugSpy).toHaveBeenCalledWith('[transcript]', 'partial', { text: 'b' })
  })
})
