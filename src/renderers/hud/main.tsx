// HUD renderer · M10 完整视觉
//
// 视觉规范见 archive/design/index.html（同一套 token 与 layout）。
// 四态：recording / hover / processing / error；hover 是 UI 子态，只在 recording 时由
// 鼠标悬停触发；其余三态来自 main 通过 hud:show 推送。
//
// 鼠标点击 hover 状态的胶囊 → send hud:cancel；orchestrator 收到后 ABORT_CANCEL 流程。

import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { Channels } from '@shared/ipc/channels.js'
import { initI18n } from '@shared/i18n/index.js'

initI18n()

type ServerState = 'hidden' | 'recording' | 'processing' | 'error'
type DisplayState = ServerState | 'hover'

function formatTimer(elapsedMs: number): string {
  const totalSec = Math.floor(elapsedMs / 1000)
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0')
  const ss = String(totalSec % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function App(): React.ReactElement | null {
  const { t } = useTranslation()
  const [state, setState] = useState<ServerState>('hidden')
  const [hover, setHover] = useState(false)
  const [partial, setPartial] = useState<string>('')
  // 错误展示用「i18nKey 优先、message fallback」两段结构：main 端透传 i18nKey 时走 t()，
  // 否则直接用 message 原文（provider 内部抛出的英文/技术错误不应被强制 i18n）
  const [errorI18nKey, setErrorI18nKey] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [, forceRerender] = useState(0)
  const recordStartRef = useRef<number>(0)

  /* IPC subscription */
  useEffect(() => {
    const offShow = window.ipc.on(Channels.HUD_SHOW, (payload) => {
      const next: ServerState = (payload?.state as ServerState | undefined) ?? 'recording'
      // 'hover' 不会从 main 主动发，但 schema 允许；映射到 recording
      const normalized: ServerState = next === 'hidden' ? 'hidden' : (next as ServerState)
      setState(normalized)
      if (normalized === 'recording') {
        setPartial('')
        setErrorMsg('')
        // 与 offHide 路径对称：进入 recording 必须把错误两段（i18nKey + message）一起清，
        // 否则上一轮残留的 errorI18nKey 会在下一次进入 error 态时短暂闪现旧文案
        setErrorI18nKey('')
        setHover(false)
        recordStartRef.current = Date.now()
      }
    })
    const offHide = window.ipc.on(Channels.HUD_HIDE, () => {
      setState('hidden')
      setPartial('')
      setErrorMsg('')
      setErrorI18nKey('')
      setHover(false)
    })
    const offPartial = window.ipc.on(Channels.SESSION_PARTIAL, (payload) => {
      if (payload?.text) setPartial(payload.text)
    })
    const offFinal = window.ipc.on(Channels.SESSION_FINAL, (payload) => {
      if (payload?.text) setPartial(payload.text)
    })
    const offError = window.ipc.on(Channels.SESSION_ERROR, (payload) => {
      setErrorI18nKey(payload?.i18nKey ?? '')
      setErrorMsg(payload?.message ?? '')
    })

    return () => {
      offShow()
      offHide()
      offPartial()
      offFinal()
      offError()
    }
  }, [])

  /* recording 期间每秒刷新计时器 —— formatTimer 只到秒级，1s 间隔即可 */
  useEffect(() => {
    if (state !== 'recording') return
    const tick = setInterval(() => forceRerender((n) => n + 1), 1000)
    return () => clearInterval(tick)
  }, [state])

  /* hover handlers —— 仅 recording 可悬停取消 */
  const onMouseEnter = useCallback(() => {
    if (state === 'recording') setHover(true)
  }, [state])
  const onMouseLeave = useCallback(() => {
    setHover(false)
  }, [])
  const onCancelClick = useCallback(() => {
    window.ipc.send(Channels.HUD_CANCEL)
    setHover(false)
  }, [])

  if (state === 'hidden') return null

  const display: DisplayState = hover && state === 'recording' ? 'hover' : state
  const elapsedMs = recordStartRef.current ? Date.now() - recordStartRef.current : 0
  // i18nKey 命中 → 走 t()；缺 key 时退到 message；都没有就保底「unknownError」
  // 注意 t() 在 fallback 模式下找不到 key 时会回 key 自己 —— 这里显式判一遍以让降级链可控
  const resolvedError = errorI18nKey
    ? t(errorI18nKey, { defaultValue: errorMsg || t('hud.unknownError') })
    : errorMsg || t('hud.unknownError')

  const className =
    'hud' +
    (display === 'hover' ? ' hud--hover' : '') +
    (display === 'processing' ? ' hud--processing' : '') +
    (display === 'error' ? ' hud--error' : '')

  return (
    <div
      className={className}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={display === 'hover' ? onCancelClick : undefined}
    >
      {/* recording: control 区 + display 区 */}
      <div className="hud-control">
        <div className="hud-mic-wrap">
          <svg
            className="hud-mic"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
          <span className="hud-pulse" />
        </div>
        <span className="hud-timer">{formatTimer(elapsedMs)}</span>
      </div>
      <div className="hud-display">
        {partial ? (
          <span className="hud-text">{partial}</span>
        ) : (
          <span className="hud-text hud-text--placeholder">识别中…</span>
        )}
      </div>

      {/* hover overlay: 取消转录 */}
      {display === 'hover' && (
        <div className="hud-cancel">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          取消转录
        </div>
      )}

      {/* processing overlay */}
      {display === 'processing' && (
        <div className="hud-overlay hud-overlay--processing">
          <span className="hud-spinner" />
          <span className="hud-label-group">
            <span>识别中</span>
            <span className="hud-dots">
              <span className="hud-dot" />
              <span className="hud-dot" />
              <span className="hud-dot" />
            </span>
          </span>
        </div>
      )}

      {/* error overlay */}
      {display === 'error' && (
        <div className="hud-overlay hud-overlay--error">
          <svg
            className="hud-error-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{resolvedError}</span>
        </div>
      )}
    </div>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
console.info('[hud] renderer booted')
