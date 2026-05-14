// uiohook 全局键盘监听 → 喂 HotkeyListener → 通知 orchestrator
//
// 副作用壳：只负责绑 uIOhook 与 app lifecycle。事件路由逻辑见 listener.ts，
// 纯状态机见 fsm.ts。
//
// 触发键：UiohookKey.AltRight（uiohook-napi 抽象后的"右 Alt"）。
//   - macOS: rawcode 0x3D (kVK_RightOption)
//   - Windows: rawcode 0xA5 (VK_RMENU)
//
// Accessibility 未授权时 uIOhook.start() 会抛异常 —— try-catch 兜底，不让 app 起不来。

import { UiohookKey, uIOhook } from 'uiohook-napi'
import type { HotkeyAction } from './fsm.js'
import { createHotkeyListener, type HotkeyListener } from './listener.js'

let started = false
let listener: HotkeyListener | null = null
// 可换的转发目标 —— listener 的 onAction 是它的稳定闭包，重复 start 时只换这里
let actionListener: ((action: HotkeyAction) => void) | null = null

/**
 * 启动全局键盘监听。Accessibility 未授权时打 warn 但不 throw，
 * 让 app 主体能继续 boot；上层可在权限授予后重试 start()。
 *
 * @param onAction 每当 FSM 派发非 null 的 action 时调用一次（START_RECORDING /
 *                 COMMIT_RECORDING / ABORT_SHORT / ABORT_CANCEL / DONE）
 * @returns ok=false 表示 uIOhook.start() 抛异常（多半是 Accessibility 未授权）
 */
export function startHotkeyListener(onAction: (action: HotkeyAction) => void): { ok: boolean } {
  actionListener = onAction
  if (started && listener) return { ok: true }

  listener = createHotkeyListener({
    targetKeycode: UiohookKey.AltRight,
    onAction: (action) => actionListener?.(action),
  })

  uIOhook.on('keydown', (e) => listener!.keyDown(e.keycode, Date.now()))
  uIOhook.on('keyup', (e) => listener!.keyUp(e.keycode, Date.now()))

  try {
    uIOhook.start()
    started = true
    return { ok: true }
  } catch (err) {
    console.warn(
      '[hotkey] uIOhook.start() failed —— Accessibility 权限可能未授予。' +
        ' 主面板会在设置阶段引导授权再重试。',
      err,
    )
    return { ok: false }
  }
}

/**
 * orchestrator 在 session 结束（COMMIT 完成 / ABORT 完成 / ERROR 处理完）时调用，
 * 让 FSM 从 processing/canceling 态回到 idle。
 */
export function dispatchSessionDone(): void {
  listener?.sessionDone()
}

/**
 * 用户在 HUD 上点击「取消转录」时调用：把 CANCEL_CLICK 事件喂给 FSM，
 * recording 态会转为 canceling 并 emit ABORT_CANCEL。
 */
export function dispatchCancelClick(): void {
  listener?.cancelClick()
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
