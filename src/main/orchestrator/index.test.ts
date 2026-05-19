// SessionOrchestrator 的测试面 —— 经 OrchestratorDeps 的 typed port 喂 hotkey action
// + provider event，断言打到 port 上的语义调用。不触碰 Electron / 真实 provider。

import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ASRCapabilities, ASRProvider, ASRStartOptions } from '@shared/types/provider.js'
import { SessionOrchestrator } from './index.js'
import type { AudioRendererPort, HudPort, OrchestratorDeps } from './ports.js'

/** 可控的 fake provider：start/finish 默认立即 resolve；finish 可 arm 成 deferred */
class FakeProvider extends EventEmitter implements ASRProvider {
  readonly id = 'fake'
  readonly capabilities: ASRCapabilities = { streaming: true, partialResults: true }
  readonly settingsSchema: Record<string, unknown> = {}
  readonly defaults: Record<string, unknown> = {}

  start = vi.fn(async (_opts: ASRStartOptions): Promise<void> => {})
  pushAudio = vi.fn((_chunk: Buffer): void => {})
  abort = vi.fn((): void => {})

  private finishDeferred: {
    promise: Promise<void>
    reject: (e: Error) => void
  } | null = null

  finish = vi.fn((): Promise<void> => this.finishDeferred?.promise ?? Promise.resolve())

  /** 让下一次 finish() 挂起，由 rejectFinish() 决定何时失败 —— 模拟 ws 在 finishing 期间断开 */
  armDeferredFinish(): void {
    let reject!: (e: Error) => void
    const promise = new Promise<void>((_res, rej) => {
      reject = rej
    })
    // 预挂一个 catch，避免 reject 后在断言前被判定为 unhandled rejection
    promise.catch(() => {})
    this.finishDeferred = { promise, reject }
  }

  rejectFinish(err: Error): void {
    this.finishDeferred?.reject(err)
  }
}

function makeHud(): HudPort {
  return {
    showState: vi.fn(),
    hide: vi.fn(),
    partial: vi.fn(),
    final: vi.fn(),
    error: vi.fn(),
    showWindow: vi.fn(),
    hideWindow: vi.fn(),
  }
}

function makeAudio(): AudioRendererPort {
  return { start: vi.fn(), stop: vi.fn(), abort: vi.fn() }
}

function setup(opts: { provider?: ASRProvider | null } = {}) {
  const provider = opts.provider === undefined ? new FakeProvider() : opts.provider
  const hud = makeHud()
  const audio = makeAudio()
  const paste = vi.fn()
  const notifyHotkeyDone = vi.fn()
  const getProvider = vi.fn((): ASRProvider | null => provider)
  const deps: OrchestratorDeps = { getProvider, hud, audio, paste, notifyHotkeyDone }
  const orch = new SessionOrchestrator(deps)
  return { orch, provider, hud, audio, paste, notifyHotkeyDone, getProvider }
}

/** 冲洗 microtask 队列（fake timer 不影响 promise，故此法仍有效） */
const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('SessionOrchestrator', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('happy path', () => {
    it('start → 50ms 后显示 HUD → 推帧 → commit → final → paste → 回 idle', async () => {
      const { orch, provider, hud, audio, paste, notifyHotkeyDone } = setup()
      const fake = provider as FakeProvider

      orch.handleHotkeyAction('START_RECORDING')
      await tick()
      expect(orch.getState()).toBe('recording')
      expect(hud.showState).toHaveBeenCalledWith('recording')
      expect(audio.start).toHaveBeenCalledTimes(1)
      expect(fake.start).toHaveBeenCalledTimes(1)
      // 50ms 防抖未到，HUD 窗口还没显示
      expect(hud.showWindow).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)
      expect(hud.showWindow).toHaveBeenCalledTimes(1)

      orch.handleAudioChunk(Buffer.from([1, 2, 3]))
      expect(fake.pushAudio).toHaveBeenCalledTimes(1)

      orch.handleHotkeyAction('COMMIT_RECORDING')
      expect(orch.getState()).toBe('processing')
      expect(audio.stop).toHaveBeenCalledTimes(1)
      expect(hud.showState).toHaveBeenCalledWith('processing')
      await tick()

      fake.emit('final', '你好世界')
      await tick()
      expect(hud.final).toHaveBeenCalledWith('你好世界', expect.any(Number))
      expect(paste).toHaveBeenCalledWith('你好世界')
      expect(hud.hide).toHaveBeenCalledTimes(1)
      expect(hud.hideWindow).toHaveBeenCalledTimes(1)
      expect(orch.getState()).toBe('idle')
      expect(notifyHotkeyDone).toHaveBeenCalledTimes(1)
    })

    it('partial 在 recording 期间透传到 HUD', async () => {
      const { orch, provider, hud } = setup()
      orch.handleHotkeyAction('START_RECORDING')
      await tick()
      ;(provider as FakeProvider).emit('partial', '你')
      expect(hud.partial).toHaveBeenCalledWith('你')
    })

    it('idle 态收到的 audio chunk 被丢弃', () => {
      const { orch, provider } = setup()
      orch.handleAudioChunk(Buffer.from([1]))
      expect((provider as FakeProvider).pushAudio).not.toHaveBeenCalled()
    })
  })

  describe('HUD 显示防抖', () => {
    it('START 后 50ms 内 abort → HUD 窗口始终不显示', async () => {
      const { orch, hud } = setup()
      orch.handleHotkeyAction('START_RECORDING')
      await tick()
      orch.handleHotkeyAction('ABORT_SHORT')
      vi.advanceTimersByTime(50)
      expect(hud.showWindow).not.toHaveBeenCalled()
    })
  })

  describe('abort', () => {
    it.each(['ABORT_SHORT', 'ABORT_CANCEL'] as const)(
      '%s → audio/provider 中止、回 idle、通知 hotkey 一次',
      async (action) => {
        const { orch, provider, hud, audio, notifyHotkeyDone } = setup()
        orch.handleHotkeyAction('START_RECORDING')
        await tick()
        orch.handleHotkeyAction(action)
        expect(audio.abort).toHaveBeenCalledTimes(1)
        expect((provider as FakeProvider).abort).toHaveBeenCalledTimes(1)
        expect(hud.hide).toHaveBeenCalledTimes(1)
        expect(orch.getState()).toBe('idle')
        expect(notifyHotkeyDone).toHaveBeenCalledTimes(1)
      },
    )

    it('abort 后迟到的 partial 被 cancelled 守卫抑制', async () => {
      const { orch, provider, hud } = setup()
      orch.handleHotkeyAction('START_RECORDING')
      await tick()
      orch.handleHotkeyAction('ABORT_CANCEL')
      // orchestrator 不主动 off provider listener，靠 cancelled 标记拦截
      ;(provider as FakeProvider).emit('partial', 'late')
      expect(hud.partial).not.toHaveBeenCalled()
    })
  })

  describe('未配置 provider', () => {
    it('getProvider 返 null → surface AUTH error，通知 hotkey 一次', () => {
      const { orch, hud, notifyHotkeyDone } = setup({ provider: null })
      orch.handleHotkeyAction('START_RECORDING')
      expect(orch.getState()).toBe('error')
      expect(hud.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH' }))
      expect(notifyHotkeyDone).toHaveBeenCalledTimes(1)
    })
  })

  describe('provider 流式中途报错', () => {
    it('error → HUD error 态 + audio abort + 通知一次；2s 后 linger 结束回 idle', async () => {
      const { orch, provider, hud, audio, notifyHotkeyDone } = setup()
      orch.handleHotkeyAction('START_RECORDING')
      await tick()
      ;(provider as FakeProvider).emit('error', {
        code: 'NETWORK',
        message: 'ws closed during streaming',
        retryable: true,
      })
      expect(orch.getState()).toBe('error')
      expect(hud.error).toHaveBeenCalledTimes(1)
      expect(hud.showState).toHaveBeenCalledWith('error')
      expect(audio.abort).toHaveBeenCalledTimes(1)
      expect(notifyHotkeyDone).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(2000)
      expect(hud.hide).toHaveBeenCalledTimes(1)
      expect(orch.getState()).toBe('idle')
    })
  })

  // 对应 issue #50：ws 在 streaming 期间断开但 session 未及时 emit 'error'
  // （例如 ready 态断开），orchestrator 在 commit 后只能靠 finish() 抛错来跳出
  // processing。
  describe('finish() 仅抛错（无 prior error 事件）', () => {
    it('orchestrator 从 processing 经 catch → surfaceError → 回 idle', async () => {
      const { orch, provider, hud, notifyHotkeyDone } = setup()
      const fake = provider as FakeProvider
      fake.finish = vi.fn(async (): Promise<void> => {
        throw new Error('session-not-streaming')
      })

      orch.handleHotkeyAction('START_RECORDING')
      await tick()
      orch.handleHotkeyAction('COMMIT_RECORDING')
      expect(orch.getState()).toBe('processing')
      await tick()

      // catch 把 state 翻成 'error'，HUD 报错，hotkey 被通知；不卡 processing
      expect(orch.getState()).toBe('error')
      expect(hud.error).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'NETWORK', message: 'session-not-streaming' }),
      )
      expect(notifyHotkeyDone).toHaveBeenCalledTimes(1)

      // 2s linger 结束回 idle
      vi.advanceTimersByTime(2000)
      expect(orch.getState()).toBe('idle')
    })
  })

  describe('ws 在 finishing 期间断开', () => {
    it('provider emit error 与 finish() reject 双路径下，hotkey 只被通知一次', async () => {
      const { orch, provider, hud, notifyHotkeyDone } = setup()
      const fake = provider as FakeProvider
      fake.armDeferredFinish()

      orch.handleHotkeyAction('START_RECORDING')
      await tick()
      orch.handleHotkeyAction('COMMIT_RECORDING')
      expect(orch.getState()).toBe('processing')

      // 模拟 DoubaoSession.handleClose：先同步 emit('error')，再 reject finish()
      fake.emit('error', {
        code: 'NETWORK',
        message: 'ws closed during finish',
        retryable: true,
      })
      fake.rejectFinish(new Error('ws closed during finish'))
      await tick()

      // emit 路径已把 state 翻成 error，commitSession 的 catch 被 state 守卫挡下 → 不重复
      expect(notifyHotkeyDone).toHaveBeenCalledTimes(1)
      expect(hud.error).toHaveBeenCalledTimes(1)
      expect(orch.getState()).toBe('error')
    })
  })
})
