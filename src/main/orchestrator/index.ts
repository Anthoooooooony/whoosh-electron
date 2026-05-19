// SessionOrchestrator —— 把 hotkey + audio renderer + ASR provider + native paste 串成一次完整的会话
//
// 输入：
//   - hotkey FSM 派发的 HotkeyAction（START_RECORDING / COMMIT_RECORDING / ABORT_SHORT / ABORT_CANCEL / DONE）
//   - audio renderer 通过 IPC 送上来的 PCM chunk（每 40ms 一帧）
//
// 输出：全部经 OrchestratorDeps 的 typed port（见 ports.ts），不直接碰 Electron / IPC channel：
//   - audio renderer 启停（AudioRendererPort）
//   - HUD 态切换 + 流式文本 + 窗口显隐（HudPort）
//   - paste 把 final 文本注入当前焦点 app
//   - notifyHotkeyDone 回调 hotkey FSM
//
// 状态机：
//   idle → recording → processing → pasting → idle
//                   ↘  error (2s) ↗ idle

import type { ASRError, ASRProvider } from '@shared/types/provider.js'
import type { HotkeyAction } from '../hotkey/fsm.js'
import { debugTranscript } from '../log.js'
import type { OrchestratorDeps } from './ports.js'

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
        this.abortSession()
        break
      case 'ABORT_CANCEL':
        this.abortSession()
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

    const provider = this.deps.getProvider()
    if (!provider) {
      // i18n key 取自 registry 的 missingCredentialsKey；message 是 main 进程的 fallback 文案
      // （HUD 渲染时优先 t(i18nKey)，message 仅在缺资源时降级用），刻意非定语、不挂 provider 名
      const i18nKey = this.deps.getMissingCredentialsKey()
      this.surfaceError({
        code: 'AUTH',
        message: 'provider credentials missing',
        retryable: false,
        i18nKey,
      })
      this.deps.notifyHotkeyDone()
      return
    }

    this.state = 'recording'
    this.cancelled = false
    this.sessionStartMs = Date.now()

    // 通知 HUD（IPC + 50ms 防抖后 BrowserWindow show）+ audio renderer
    this.deps.hud.showState('recording')
    this.scheduleHudShow()
    this.deps.audio.start()

    // 挂 provider 事件
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
    this.deps.audio.stop()
    this.deps.hud.showState('processing')
    this.ensureHudShown()

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

  private abortSession(): void {
    this.cancelled = true
    this.deps.audio.abort()
    this.provider?.abort()
    this.provider = null
    this.hideHud()
    this.state = 'idle'
    this.deps.notifyHotkeyDone()
  }

  /* ───── provider events ───── */

  private onProviderPartial(text: string): void {
    if (this.cancelled) return
    debugTranscript('partial', { text })
    this.deps.hud.partial(text)
  }

  private async onProviderFinal(text: string): Promise<void> {
    if (this.cancelled) {
      this.provider = null
      this.state = 'idle'
      this.deps.notifyHotkeyDone()
      return
    }

    this.state = 'pasting'
    const durationMs = Date.now() - this.sessionStartMs
    debugTranscript('final', { text, durationMs })
    this.deps.hud.final(text, durationMs)

    try {
      this.deps.paste(text)
    } catch (err) {
      console.warn('[orchestrator] paste failed:', err)
    }

    this.hideHud()
    this.provider = null
    this.state = 'idle'
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
    this.deps.hud.error(err)
    this.deps.hud.showState('error')
    this.ensureHudShown()
    this.deps.audio.abort()

    setTimeout(() => {
      if (this.state === 'error') {
        this.hideHud()
        this.state = 'idle'
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
      this.deps.hud.showWindow()
      this.hudShown = true
    }, HUD_SHOW_DEBOUNCE_MS)
  }

  private ensureHudShown(): void {
    this.cancelHudShowTimer()
    if (!this.hudShown) {
      this.deps.hud.showWindow()
      this.hudShown = true
    }
  }

  private hideHud(): void {
    this.cancelHudShowTimer()
    this.deps.hud.hide()
    if (this.hudShown) {
      this.deps.hud.hideWindow()
      this.hudShown = false
    }
  }

  private cancelHudShowTimer(): void {
    if (this.hudShowTimer !== null) {
      clearTimeout(this.hudShowTimer)
      this.hudShowTimer = null
    }
  }
}
