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
import { Channels } from '@shared/ipc/channels.js'
import { getAppWindows } from '../windows.js'
import { createHotkeyFSM, type HotkeyFSM, type HotkeyAction } from './fsm.js'

let started = false
let fsm: HotkeyFSM | null = null

/**
 * 启动全局键盘监听。Accessibility 未授权时打 warn 但不 throw，
 * 让 app 主体能继续 boot；上层可在权限授予后重试 start()。
 */
export function startHotkeyListener(): { fsm: HotkeyFSM; ok: boolean } {
  if (started && fsm) return { fsm, ok: true }

  fsm = createHotkeyFSM()

  // M5 调试期：记录按下时刻以便日志里打出按住时长
  let pressDownTs: number | null = null

  /**
   * M5/M6 stub：把 FSM action 翻成 audio renderer 的 IPC 命令。
   * M9 orchestrator 接管后这层会被替换为：FSM → orchestrator → audio + provider + paste 编排。
   */
  function bridgeToAudio(action: HotkeyAction): void {
    const audio = getAppWindows()?.audio
    if (!audio) return
    switch (action) {
      case 'START_RECORDING':
        audio.webContents.send(Channels.AUDIO_START, { deviceId: null })
        break
      case 'COMMIT_RECORDING':
      case 'ABORT_SHORT':
        audio.webContents.send(Channels.AUDIO_STOP)
        break
      case 'ABORT_CANCEL':
        audio.webContents.send(Channels.AUDIO_ABORT)
        break
      case 'DONE':
        break
    }
  }

  /**
   * M5 stub：FSM 发出 COMMIT_RECORDING / ABORT_CANCEL 后会进 processing/canceling 态，
   * 等待 SESSION_DONE 才返回 idle。M9 orchestrator 写好之前没人发 SESSION_DONE，
   * 这里立即 self-loop 一下让 FSM 解锁，方便手测连续按键。
   */
  function selfLoopDoneIfNeeded(action: ReturnType<HotkeyFSM['send']>): void {
    if (action === 'COMMIT_RECORDING' || action === 'ABORT_CANCEL') {
      const next = fsm!.send({ type: 'SESSION_DONE' })
      if (next) console.info(`[hotkey] ${next} (M5 stub)`)
    }
  }

  uIOhook.on('keydown', (e) => {
    if (e.keycode !== UiohookKey.AltRight) return
    const ts = Date.now()
    pressDownTs ??= ts
    const action = fsm!.send({ type: 'KEY_DOWN', ts })
    if (action) {
      console.info(`[hotkey] ${action}`)
      bridgeToAudio(action)
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
      bridgeToAudio(action)
    }
    selfLoopDoneIfNeeded(action)
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
