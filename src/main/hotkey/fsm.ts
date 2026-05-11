// HotkeyFSM —— 纯逻辑状态机，不依赖 Electron / uiohook
//
// 输入：来自 uiohook listener 的 KEY_DOWN/KEY_UP，或来自 HUD 的 CANCEL_CLICK，
//       或来自 SessionOrchestrator 的 SESSION_DONE/SESSION_ERROR
// 输出：每次 send 返回一个 Action 给上层（orchestrator）执行；返回 null 表示无副作用
//
// 状态机图：
//                ┌──────────────── DONE ─────────────────┐
//                │                                       │
//                ▼                                       │
//   ┌─────────────┐    KEY_DOWN     ┌─────────────┐ KEY_UP(>300ms)
//   │    idle     │ ──────────────► │  recording  │ ──────────────► processing
//   │             │ START_RECORDING │             │ COMMIT_RECORDING
//   └─────────────┘                 └─────────────┘
//          ▲                            │     │
//          │   KEY_UP(<300ms)           │     │ CANCEL_CLICK
//          └────────────────────────────┘     │ ABORT_CANCEL
//                       ABORT_SHORT           │
//                                             ▼
//                                       ┌──────────┐
//                                       │canceling │ ── SESSION_DONE ──► idle (DONE)
//                                       └──────────┘
//
// 注意：60s 录音上限不在 FSM 内处理（FSM 无 timer）；由 orchestrator 起 setTimeout
//       到 60s 触发一次合成 KEY_UP（携带 ts = press_start + 60s）即可。

export type HotkeyState = 'idle' | 'recording' | 'canceling' | 'processing'

export type HotkeyEvent =
  | { type: 'KEY_DOWN'; ts: number }
  | { type: 'KEY_UP'; ts: number }
  | { type: 'CANCEL_CLICK' }
  | { type: 'SESSION_DONE' }
  | { type: 'SESSION_ERROR' }

export type HotkeyAction =
  | 'START_RECORDING'
  | 'COMMIT_RECORDING'
  | 'ABORT_SHORT'
  | 'ABORT_CANCEL'
  | 'DONE'

/** 短按阈值；松开时若按住时长 < 该值则视为误触，丢弃不发 ASR 请求 */
export const SHORT_PRESS_THRESHOLD_MS = 300

export interface HotkeyFSM {
  send(event: HotkeyEvent): HotkeyAction | null
  getState(): HotkeyState
  /** 仅供测试 inspect 内部时间戳；上层不应依赖 */
  getPressStartTs(): number | null
}

export function createHotkeyFSM(): HotkeyFSM {
  let state: HotkeyState = 'idle'
  let pressStartTs: number | null = null

  function send(event: HotkeyEvent): HotkeyAction | null {
    switch (state) {
      case 'idle':
        if (event.type === 'KEY_DOWN') {
          state = 'recording'
          pressStartTs = event.ts
          return 'START_RECORDING'
        }
        // idle 下其它事件全部丢弃
        return null

      case 'recording':
        if (event.type === 'KEY_DOWN') {
          // OS auto-repeat 重复 fire KEY_DOWN —— 已经在录音，忽略
          return null
        }
        if (event.type === 'KEY_UP') {
          // 防御性：理论上 recording 必然有 pressStartTs
          if (pressStartTs === null) {
            state = 'idle'
            return null
          }
          const heldMs = event.ts - pressStartTs
          pressStartTs = null
          if (heldMs < SHORT_PRESS_THRESHOLD_MS) {
            state = 'idle'
            return 'ABORT_SHORT'
          }
          state = 'processing'
          return 'COMMIT_RECORDING'
        }
        if (event.type === 'CANCEL_CLICK') {
          state = 'canceling'
          pressStartTs = null
          return 'ABORT_CANCEL'
        }
        if (event.type === 'SESSION_ERROR') {
          state = 'idle'
          pressStartTs = null
          return 'DONE'
        }
        // SESSION_DONE 在 recording 阶段不可能合法发生（还没 commit），忽略
        return null

      case 'canceling':
        // 等待 session 真正终止；期间所有 key 事件忽略
        if (event.type === 'SESSION_DONE' || event.type === 'SESSION_ERROR') {
          state = 'idle'
          return 'DONE'
        }
        return null

      case 'processing':
        // 等待 ASR finalize + paste；期间所有 key 事件忽略
        if (event.type === 'SESSION_DONE' || event.type === 'SESSION_ERROR') {
          state = 'idle'
          return 'DONE'
        }
        return null
    }
  }

  return {
    send,
    getState: () => state,
    getPressStartTs: () => pressStartTs,
  }
}
