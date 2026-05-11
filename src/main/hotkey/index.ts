// uiohook 全局键盘监听 → 过滤右 Option/右 Alt → 喂 HotkeyFSM
//
// 副作用层；纯逻辑见 fsm.ts。
//
// 触发键：UiohookKey.AltRight（uiohook-napi 抽象后的"右 Alt"）。
//   - macOS: rawcode 0x3D (kVK_RightOption)
//   - Windows: rawcode 0xA5 (VK_RMENU)
//
// Accessibility 未授权时 uIOhook.start() 会抛异常 —— try-catch 兜底，不让 app 起不来。
// M11+ 在设置面板检测权限状态时会重启 listener。

import { UiohookKey, uIOhook } from 'uiohook-napi'
import { createHotkeyFSM, type HotkeyFSM } from './fsm.js'

let started = false
let fsm: HotkeyFSM | null = null

/**
 * 启动全局键盘监听。Accessibility 未授权时打 warn 但不 throw，
 * 让 app 主体能继续 boot；上层可在权限授予后重试 start()。
 */
export function startHotkeyListener(): { fsm: HotkeyFSM; ok: boolean } {
  if (started && fsm) return { fsm, ok: true }

  fsm = createHotkeyFSM()

  uIOhook.on('keydown', (e) => {
    if (e.keycode !== UiohookKey.AltRight) return
    const action = fsm!.send({ type: 'KEY_DOWN', ts: Date.now() })
    if (action) console.info(`[hotkey] ${action}`)
  })

  uIOhook.on('keyup', (e) => {
    if (e.keycode !== UiohookKey.AltRight) return
    const action = fsm!.send({ type: 'KEY_UP', ts: Date.now() })
    if (action) console.info(`[hotkey] ${action}`)
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
