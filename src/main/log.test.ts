// debugTranscript 测试 —— 守住「verbose=false 时零 console 输出」的隐私底线
//
// 通过 vi.mock 替换 ./store/index.js 的 isVerboseLoggingEnabled 实现，避免触达真实 electron-store。
// 该入口跳过整 schema 的 zod safeParse 开销，是热路径专用读取。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const isVerboseMock = vi.fn<() => boolean>()

vi.mock('./store/index.js', () => ({
  isVerboseLoggingEnabled: (): boolean => isVerboseMock(),
}))

describe('debugTranscript', () => {
  beforeEach(() => {
    vi.resetModules()
    isVerboseMock.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('verbose=false → no-op；console.debug 不被调用', async () => {
    isVerboseMock.mockReturnValue(false)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { debugTranscript } = await import('./log.js')

    debugTranscript('partial', { text: '你好' })
    debugTranscript('final', { text: '你好世界', durationMs: 1200 })

    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('verbose=true → 真写 console.debug，带 label + fields', async () => {
    isVerboseMock.mockReturnValue(true)
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

  it('toggle 后续切换立即生效（每次调 isVerboseLoggingEnabled，不缓存）', async () => {
    // 起始 off → 切到 on → 再切回 off；同一个 debugTranscript 引用三次调用的行为必须严格跟随 store
    isVerboseMock.mockReturnValueOnce(false)
    isVerboseMock.mockReturnValueOnce(true)
    isVerboseMock.mockReturnValueOnce(false)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { debugTranscript } = await import('./log.js')

    debugTranscript('partial', { text: 'a' })
    debugTranscript('partial', { text: 'b' })
    debugTranscript('partial', { text: 'c' })

    expect(debugSpy).toHaveBeenCalledTimes(1)
    expect(debugSpy).toHaveBeenCalledWith('[transcript]', 'partial', { text: 'b' })
  })
})
