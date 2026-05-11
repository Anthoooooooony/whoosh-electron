// uiohook 全局键盘监听 → 过滤右 Option/右 Alt → 喂 HotkeyFSM → 通知 orchestrator
//
// 副作用层；纯逻辑见 fsm.ts。
//
// 触发键：UiohookKey.AltRight（uiohook-napi 抽象后的"右 Alt"）。
//   - macOS: rawcode 0x3D (kVK_RightOption)
//   - Windows: rawcode 0xA5 (VK_RMENU)
//
// Accessibility 未授权时 uIOhook.start() 会抛异常 —— try-catch 兜底，不让 app 起不来。

import { UiohookKey, uIOhook } from 'uiohook-napi'
import { createHotkeyFSM, type HotkeyAction, type HotkeyFSM } from './fsm.js'

let started = false
let fsm: HotkeyFSM | null = null
let actionListener: ((action: HotkeyAction) => void) | null = null

/**
 * 启动全局键盘监听。Accessibility 未授权时打 warn 但不 throw，
 * 让 app 主体能继续 boot；上层可在权限授予后重试 start()。
 *
 * @param onAction 每当 FSM 派发非 null 的 action 时调用一次（START_RECORDING /
 *                 COMMIT_RECORDING / ABORT_SHORT / ABORT_CANCEL / DONE）
 */
export function startHotkeyListener(onAction: (action: HotkeyAction) => void): {
  fsm: HotkeyFSM
  ok: boolean
} {
  if (started && fsm) {
    actionListener = onAction
    return { fsm, ok: true }
  }

  fsm = createHotkeyFSM()
  actionListener = onAction

  // 调试用：记录按下时刻以便日志里打出按住时长（M14 menubar/tray 上线后或可裁掉）
  let pressDownTs: number | null = null

  uIOhook.on('keydown', (e) => {
    if (e.keycode !== UiohookKey.AltRight) return
    const ts = Date.now()
    pressDownTs ??= ts
    const action = fsm!.send({ type: 'KEY_DOWN', ts })
    if (action) {
      console.info(`[hotkey] ${action}`)
      actionListener?.(action)
    }
  })

  uIOhook.on('keyup', (e) => {
    if (e.keycode !== UiohookKey.AltRight) return
    const ts = Date.now()
    const heldMs = pressDownTs !== null ? ts - pressDownTs : -1
    pressDownTs = null
    const action = fsm!.send({ type: 'KEY_UP', ts })
    if (action) {
      console.info(`[hotkey] ${action} (held ${heldMs}ms)`)
      actionListener?.(action)
    }
  })

  try {
    uIOhook.start()
    started = true
    return { fsm, ok: true }
  } catch (err) {
    console.warn(
      '[hotkey] uIOhook.start() failed —— Accessibility 权限可能未授予。' +
        ' 主面板会在设置阶段引导授权再重试。',
      err,
    )
    return { fsm, ok: false }
  }
}

/**
 * orchestrator 在 session 结束（COMMIT 完成 / ABORT 完成 / ERROR 处理完）时调用，
 * 让 FSM 从 processing/canceling 态回到 idle。
 */
export function dispatchSessionDone(): void {
  if (!fsm) return
  const action = fsm.send({ type: 'SESSION_DONE' })
  if (action) {
    console.info(`[hotkey] ${action}`)
    actionListener?.(action)
  }
}

export function stopHotkeyListener(): void {
  if (!started) return
  try {
    uIOhook.stop()
  } catch {
    // 进程退出阶段 stop 抛异常不影响关闭
  }
  started = false
}

/** 供 main/index.ts 之外（如 orchestrator）取 FSM 实例派发 SESSION_DONE/ERROR */
export function getHotkeyFSM(): HotkeyFSM | null {
  return fsm
}
