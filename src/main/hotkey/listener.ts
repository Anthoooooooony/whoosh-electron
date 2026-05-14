// HotkeyListener —— 事件路由纯核心，不依赖 uiohook-napi / Electron
//
// 职责：把原始键盘 / HUD / orchestrator 事件喂给 HotkeyFSM，统一 send → log → forward。
//   - keyDown/keyUp 自带 keycode 过滤：非目标键直接丢弃（targetKeycode 由 native 壳注入，
//     核心因此不 import uiohook-napi，可被 listener.test.ts 直接构造）
//   - keyUp 在 send 之前读 fsm.getPressStartTs() 算按住时长，写进调试日志的后缀
//   - log 可注入（默认 console.info），测试借此断言 heldMs
//
// 纯逻辑的状态机本身见 fsm.ts；本文件只是它外面的事件路由层。
// 绑定 uIOhook 的副作用壳见 index.ts。

import { createHotkeyFSM, type HotkeyAction, type HotkeyEvent } from './fsm.js'

export interface HotkeyListener {
  /** 原始 keydown：keycode !== targetKeycode 时丢弃 */
  keyDown(keycode: number, ts: number): void
  /** 原始 keyup：keycode !== targetKeycode 时丢弃；日志带 (held Nms) */
  keyUp(keycode: number, ts: number): void
  /** HUD「取消转录」点击 */
  cancelClick(): void
  /** orchestrator 在 session 终止时回调，让 FSM 从 processing/canceling 回 idle */
  sessionDone(): void
}

export interface HotkeyListenerDeps {
  /** native 壳注入的目标键 keycode（uiohook 抽象后的"右 Alt"）*/
  targetKeycode: number
  /** FSM 派发非 null action 时调用一次 */
  onAction: (action: HotkeyAction) => void
  /** 调试日志出口，默认 console.info；测试注入 fake 以断言 heldMs */
  log?: (msg: string) => void
}

export function createHotkeyListener(deps: HotkeyListenerDeps): HotkeyListener {
  const { targetKeycode, onAction } = deps
  const log = deps.log ?? ((msg: string): void => console.info(msg))
  const fsm = createHotkeyFSM()

  function dispatch(event: HotkeyEvent, suffix = ''): void {
    const action = fsm.send(event)
    if (action) {
      log(`[hotkey] ${action}${suffix}`)
      onAction(action)
    }
  }

  return {
    keyDown(keycode, ts) {
      if (keycode !== targetKeycode) return
      dispatch({ type: 'KEY_DOWN', ts })
    },
    keyUp(keycode, ts) {
      if (keycode !== targetKeycode) return
      // 必须在 send 之前读 —— KEY_UP 会把 pressStartTs 清空
      const pressStartTs = fsm.getPressStartTs()
      const heldMs = pressStartTs !== null ? ts - pressStartTs : -1
      dispatch({ type: 'KEY_UP', ts }, ` (held ${heldMs}ms)`)
    },
    cancelClick() {
      dispatch({ type: 'CANCEL_CLICK' }, ' (via HUD)')
    },
    sessionDone() {
      dispatch({ type: 'SESSION_DONE' })
    },
  }
}
