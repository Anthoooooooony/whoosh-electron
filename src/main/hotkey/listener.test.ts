// createHotkeyListener 的事件路由测试 —— keycode 过滤、send→log→forward、heldMs 计算。
// FSM 状态机本身的迁移规则由 fsm.test.ts 覆盖，这里不重测。

import { describe, expect, it, vi } from 'vitest'
import { SHORT_PRESS_THRESHOLD_MS } from './fsm.js'
import { createHotkeyListener } from './listener.js'

const TARGET = 100 // 任意目标 keycode；核心不依赖 uiohook 真实常量
const OTHER = 200

function setup() {
  const onAction = vi.fn()
  const log = vi.fn()
  const listener = createHotkeyListener({ targetKeycode: TARGET, onAction, log })
  return { listener, onAction, log }
}

describe('createHotkeyListener', () => {
  describe('核心路径', () => {
    it('keyDown(target) → 转发 START_RECORDING', () => {
      const { listener, onAction, log } = setup()
      listener.keyDown(TARGET, 1000)
      expect(onAction).toHaveBeenCalledExactlyOnceWith('START_RECORDING')
      expect(log).toHaveBeenCalledExactlyOnceWith('[hotkey] START_RECORDING')
    })

    it(`keyUp(target) 按住 >= ${SHORT_PRESS_THRESHOLD_MS}ms → 转发 COMMIT_RECORDING`, () => {
      const { listener, onAction } = setup()
      listener.keyDown(TARGET, 1000)
      listener.keyUp(TARGET, 1000 + SHORT_PRESS_THRESHOLD_MS)
      expect(onAction).toHaveBeenNthCalledWith(2, 'COMMIT_RECORDING')
    })

    it(`keyUp(target) 按住 < ${SHORT_PRESS_THRESHOLD_MS}ms → 转发 ABORT_SHORT`, () => {
      const { listener, onAction } = setup()
      listener.keyDown(TARGET, 1000)
      listener.keyUp(TARGET, 1000 + SHORT_PRESS_THRESHOLD_MS - 1)
      expect(onAction).toHaveBeenNthCalledWith(2, 'ABORT_SHORT')
    })

    it('cancelClick() → 转发 ABORT_CANCEL，日志带 (via HUD)', () => {
      const { listener, onAction, log } = setup()
      listener.keyDown(TARGET, 1000)
      listener.cancelClick()
      expect(onAction).toHaveBeenNthCalledWith(2, 'ABORT_CANCEL')
      expect(log).toHaveBeenNthCalledWith(2, '[hotkey] ABORT_CANCEL (via HUD)')
    })

    it('processing 态下 sessionDone() → 转发 DONE', () => {
      const { listener, onAction } = setup()
      listener.keyDown(TARGET, 1000)
      listener.keyUp(TARGET, 1000 + SHORT_PRESS_THRESHOLD_MS) // → processing
      listener.sessionDone()
      expect(onAction).toHaveBeenNthCalledWith(3, 'DONE')
    })
  })

  describe('keycode 过滤', () => {
    it('keyDown 非目标键 → 不转发、不 log，FSM 不受扰', () => {
      const { listener, onAction, log } = setup()
      listener.keyDown(OTHER, 1000)
      expect(onAction).not.toHaveBeenCalled()
      expect(log).not.toHaveBeenCalled()
      // FSM 仍在 idle —— 紧接的目标键 keyDown 照常产出 START_RECORDING
      listener.keyDown(TARGET, 1100)
      expect(onAction).toHaveBeenCalledExactlyOnceWith('START_RECORDING')
    })

    it('keyUp 非目标键 → 录音中不受扰', () => {
      const { listener, onAction } = setup()
      listener.keyDown(TARGET, 1000)
      listener.keyUp(OTHER, 1500)
      expect(onAction).toHaveBeenCalledExactlyOnceWith('START_RECORDING')
    })
  })

  describe('null action 不 forward / 不 log', () => {
    it('录音中的 auto-repeat keyDown 被丢弃', () => {
      const { listener, onAction, log } = setup()
      listener.keyDown(TARGET, 1000)
      listener.keyDown(TARGET, 1050) // auto-repeat → FSM 返回 null
      expect(onAction).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledTimes(1)
    })

    it('idle 态下 sessionDone() 被丢弃', () => {
      const { listener, onAction, log } = setup()
      listener.sessionDone()
      expect(onAction).not.toHaveBeenCalled()
      expect(log).not.toHaveBeenCalled()
    })
  })

  describe('heldMs 计算', () => {
    it('keyUp 日志后缀按 (首次 keyDown ts) 算按住时长', () => {
      const { listener, log } = setup()
      listener.keyDown(TARGET, 1000)
      listener.keyUp(TARGET, 2500)
      expect(log).toHaveBeenNthCalledWith(2, '[hotkey] COMMIT_RECORDING (held 1500ms)')
    })

    it('auto-repeat 不改写 pressStart —— heldMs 仍按首次 keyDown 算', () => {
      const { listener, log } = setup()
      listener.keyDown(TARGET, 1000)
      listener.keyDown(TARGET, 1200) // auto-repeat
      listener.keyUp(TARGET, 2000)
      expect(log).toHaveBeenNthCalledWith(2, '[hotkey] COMMIT_RECORDING (held 1000ms)')
    })
  })

  describe('log 默认出口', () => {
    it('未注入 log 时落到 console.info', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
      const listener = createHotkeyListener({ targetKeycode: TARGET, onAction: vi.fn() })
      listener.keyDown(TARGET, 1000)
      expect(spy).toHaveBeenCalledExactlyOnceWith('[hotkey] START_RECORDING')
      spy.mockRestore()
    })
  })
})
