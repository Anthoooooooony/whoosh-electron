// SessionOrchestrator —— 把 hotkey + audio renderer + ASR provider + native paste 串成一次完整的会话
//
// 输入：
//   - hotkey FSM 派发的 HotkeyAction （START_RECORDING / COMMIT_RECORDING / ABORT_SHORT / ABORT_CANCEL）
//   - audio renderer 通过 IPC 送上来的 PCM chunk（每 40ms 一帧）
//
// 输出：
//   - audio renderer 的启停命令（audio:start / audio:stop / audio:abort）
//   - HUD 的态切换 + 流式文本（hud:show / hud:hide / session:state / session:partial / session:final / session:error）
//   - native paste 把 final 文本注入到当前焦点 app
//   - notifyHotkeyDone 回调（取代 M5 selfLoopDoneIfNeeded stub）
//
// 状态机：
//   idle → recording → processing → pasting → idle
//                   ↘  error (2s) ↗ idle

import type { WebContents } from 'electron'
import { Channels } from '@shared/ipc/channels.js'
import { pasteText } from '@native/paste/index.js'
import { DoubaoProvider, type DoubaoProviderConfig } from '@providers/doubao/index.js'
import type { ASRError, ASRProvider } from '@shared/types/provider.js'
import type { HotkeyAction } from '../hotkey/fsm.js'

export interface OrchestratorDeps {
  /** 调用方拉取当前生效的 Doubao 配置；null 表示尚未配好（onboarding 未完成或凭据缺失） */
  getDoubaoConfig(): DoubaoProviderConfig | null
  /** 用户在 Settings 选定的 input device id；null/空 = 系统默认 */
  getInputDeviceId(): string | null
  getAudioWebContents(): WebContents | undefined
  getHudWebContents(): WebContents | undefined
  /** showInactive 把 HUD BrowserWindow 显示到 active screen，但不抢焦点 */
  showHudWindow(): void
  /** hide 把 HUD BrowserWindow 完全隐藏（OS 级，比单纯 hud:hide IPC 更彻底） */
  hideHudWindow(): void
  /** session 终止时回调 hotkey FSM 派发 SESSION_DONE，让其从 processing/canceling 回 idle */
  notifyHotkeyDone(): void
}

type State = 'idle' | 'recording' | 'processing' | 'pasting' | 'error'

const HUD_ERROR_LINGER_MS = 2000
/** 显示防抖：按键按下后 N ms 才显示 HUD，避免误触/极短按导致 HUD 闪一下 */
const HUD_SHOW_DEBOUNCE_MS = 50

export class SessionOrchestrator {
  private state: State = 'idle'
  private provider: ASRProvider | null = null
  private cancelled = false
  private sessionStartMs = 0
  private hudShowTimer: ReturnType<typeof setTimeout> | null = null
  private hudShown = false

  constructor(private readonly deps: OrchestratorDeps) {}

  getState(): State {
    return this.state
  }

  /* ───── inputs from hotkey FSM ───── */

  handleHotkeyAction(action: HotkeyAction): void {
    switch (action) {
      case 'START_RECORDING':
        void this.startSession()
        break
      case 'COMMIT_RECORDING':
        void this.commitSession()
        break
      case 'ABORT_SHORT':
        this.abortSession({ surfaceError: false })
        break
      case 'ABORT_CANCEL':
        this.abortSession({ surfaceError: false })
        break
      case 'DONE':
        // hotkey FSM 反向自驱动；orchestrator 自己不响应 DONE
        break
    }
  }

  /* ───── inputs from audio renderer IPC ───── */

  handleAudioChunk(chunk: Buffer): void {
    if (this.state !== 'recording') return
    this.provider?.pushAudio(chunk)
  }

  /* ───── lifecycle ───── */

  private async startSession(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'error') {
      console.warn(`[orchestrator] start ignored: state=${this.state}`)
      return
    }

    const config = this.deps.getDoubaoConfig()
    if (!config) {
      this.surfaceError({
        code: 'AUTH',
        message: '尚未配置豆包凭据（请在 Settings 填写或设置 .env DOUBAO_API_KEY）',
        retryable: false,
      })
      this.deps.notifyHotkeyDone()
      return
    }

    this.state = 'recording'
    this.cancelled = false
    this.sessionStartMs = Date.now()

    // 通知 HUD（IPC + 50ms 防抖后 BrowserWindow show）+ audio renderer
    this.deps.getHudWebContents()?.send(Channels.HUD_SHOW, { state: 'recording' })
    this.scheduleHudShow()
    this.broadcastSessionState()
    this.deps.getAudioWebContents()?.send(Channels.AUDIO_START, {
      deviceId: this.deps.getInputDeviceId() || null,
    })

    // 创建 provider 并挂事件
    const provider = new DoubaoProvider(config)
    provider.on('partial', (text) => this.onProviderPartial(text))
    provider.on('final', (text) => {
      void this.onProviderFinal(text)
    })
    provider.on('error', (err) => this.onProviderError(err))
    this.provider = provider

    try {
      await provider.start({ sampleRate: 16000, encoding: 'pcm_s16le' })
    } catch (err) {
      // provider 'error' 事件已经处理过；这里只 swallow，避免 unhandled rejection
      if (!this.cancelled) console.warn('[orchestrator] provider.start failed:', err)
      return
    }

    // 启动过程中被 abort 掉了
    if (this.cancelled) {
      provider.abort()
      this.provider = null
    }
  }

  private async commitSession(): Promise<void> {
    if (this.state !== 'recording') {
      console.warn(`[orchestrator] commit ignored: state=${this.state}`)
      return
    }

    this.state = 'processing'
    this.deps.getAudioWebContents()?.send(Channels.AUDIO_STOP)
    this.deps.getHudWebContents()?.send(Channels.HUD_SHOW, { state: 'processing' })
    this.ensureHudShown()
    this.broadcastSessionState()

    try {
      await this.provider?.finish()
    } catch (err) {
      console.warn('[orchestrator] provider.finish failed:', err)
      // 兜底：若 provider 没主动 emit 'error'（例如 ws 在 finishing 期间被对端关掉），
      // state 会卡在 processing。这里显式 surface 一次让 HUD 走 error → idle。
      if (this.state === 'processing') {
        this.surfaceError({
          code: 'NETWORK',
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
        })
        this.provider = null
        this.deps.notifyHotkeyDone()
      }
    }
  }

  private abortSession(_opts: { surfaceError: boolean }): void {
    this.cancelled = true
    this.deps.getAudioWebContents()?.send(Channels.AUDIO_ABORT)
    this.provider?.abort()
    this.provider = null
    this.hideHud()
    this.state = 'idle'
    this.broadcastSessionState()
    this.deps.notifyHotkeyDone()
  }

  /* ───── provider events ───── */

  private onProviderPartial(text: string): void {
    if (this.cancelled) return
    this.deps.getHudWebContents()?.send(Channels.SESSION_PARTIAL, { text })
  }

  private async onProviderFinal(text: string): Promise<void> {
    if (this.cancelled) {
      this.provider = null
      this.state = 'idle'
      this.broadcastSessionState()
      this.deps.notifyHotkeyDone()
      return
    }

    this.state = 'pasting'
    const durationMs = Date.now() - this.sessionStartMs
    this.deps.getHudWebContents()?.send(Channels.SESSION_FINAL, { text, durationMs })

    try {
      pasteText(text)
    } catch (err) {
      console.warn('[orchestrator] nativePaste.pasteText failed:', err)
    }

    this.hideHud()
    this.provider = null
    this.state = 'idle'
    this.broadcastSessionState()
    this.deps.notifyHotkeyDone()
  }

  private onProviderError(err: ASRError): void {
    this.surfaceError(err)
    this.provider = null
    this.deps.notifyHotkeyDone()
  }

  /* ───── error surfacing ───── */

  private surfaceError(err: ASRError): void {
    this.state = 'error'
    this.deps.getHudWebContents()?.send(Channels.SESSION_ERROR, {
      code: this.mapErrorCode(err.code),
      message: err.message,
    })
    this.deps.getHudWebContents()?.send(Channels.HUD_SHOW, { state: 'error' })
    this.ensureHudShown()
    this.broadcastSessionState()
    this.deps.getAudioWebContents()?.send(Channels.AUDIO_ABORT)

    setTimeout(() => {
      if (this.state === 'error') {
        this.hideHud()
        this.state = 'idle'
        this.broadcastSessionState()
      }
    }, HUD_ERROR_LINGER_MS)
  }

  /* ───── HUD show/hide helpers ───── */

  private scheduleHudShow(): void {
    this.cancelHudShowTimer()
    this.hudShowTimer = setTimeout(() => {
      this.hudShowTimer = null
      // 期间被 abort 掉了就不再显示
      if (this.cancelled || this.state === 'idle') return
      this.deps.showHudWindow()
      this.hudShown = true
    }, HUD_SHOW_DEBOUNCE_MS)
  }

  private ensureHudShown(): void {
    this.cancelHudShowTimer()
    if (!this.hudShown) {
      this.deps.showHudWindow()
      this.hudShown = true
    }
  }

  private hideHud(): void {
    this.cancelHudShowTimer()
    this.deps.getHudWebContents()?.send(Channels.HUD_HIDE)
    if (this.hudShown) {
      this.deps.hideHudWindow()
      this.hudShown = false
    }
  }

  private cancelHudShowTimer(): void {
    if (this.hudShowTimer !== null) {
      clearTimeout(this.hudShowTimer)
      this.hudShowTimer = null
    }
  }

  private mapErrorCode(
    code: ASRError['code'],
  ): 'NETWORK_ERROR' | 'PROVIDER_AUTH' | 'PROVIDER_QUOTA' | 'UNKNOWN' {
    switch (code) {
      case 'AUTH':
        return 'PROVIDER_AUTH'
      case 'QUOTA':
        return 'PROVIDER_QUOTA'
      case 'NETWORK':
        return 'NETWORK_ERROR'
      default:
        return 'UNKNOWN'
    }
  }

  private broadcastSessionState(): void {
    const sessionState: 'idle' | 'recording' | 'processing' | 'error' =
      this.state === 'pasting'
        ? 'processing'
        : (this.state as 'idle' | 'recording' | 'processing' | 'error')
    const payload = { state: sessionState }
    this.deps.getAudioWebContents()?.send(Channels.SESSION_STATE, payload)
    this.deps.getHudWebContents()?.send(Channels.SESSION_STATE, payload)
  }
}
