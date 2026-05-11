import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

// M9 占位：订阅 session 事件展示状态 + partial 文本
// M10 用 design/index.html 视觉规范替换 HudCapsule / HudRecording / HudHover / HudProcessing / HudError 四个组件

type HudState = 'hidden' | 'recording' | 'hover' | 'processing' | 'error'

function App(): React.ReactElement | null {
  const [state, setState] = useState<HudState>('hidden')
  const [partial, setPartial] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [recordStartMs, setRecordStartMs] = useState<number>(0)
  const [tick, setTick] = useState<number>(0)

  useEffect(() => {
    const offShow = window.ipc.on('hud:show', (payload) => {
      const next = payload?.state ?? 'recording'
      setState(next)
      if (next === 'recording') {
        setPartial('')
        setError('')
        setRecordStartMs(Date.now())
      }
    })
    const offHide = window.ipc.on('hud:hide', () => {
      setState('hidden')
      setPartial('')
      setError('')
    })
    const offPartial = window.ipc.on('session:partial', (payload) => {
      if (payload?.text) setPartial(payload.text)
    })
    const offFinal = window.ipc.on('session:final', (payload) => {
      if (payload?.text) setPartial(payload.text)
    })
    const offError = window.ipc.on('session:error', (payload) => {
      setError(payload?.message ?? 'Unknown error')
    })

    const timer = setInterval(() => setTick((t) => t + 1), 250)
    return () => {
      offShow()
      offHide()
      offPartial()
      offFinal()
      offError()
      clearInterval(timer)
    }
  }, [])

  if (state === 'hidden') return null

  const elapsed =
    state === 'recording' && recordStartMs ? Math.floor((Date.now() - recordStartMs) / 1000) : 0
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  // useState'tick' just to trigger re-render at 250ms cadence; value unused
  void tick

  const isError = state === 'error'
  const isProcessing = state === 'processing'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 14px',
        background: isError ? 'rgba(184, 50, 41, 0.18)' : 'rgba(248, 244, 234, 0.82)',
        backdropFilter: 'blur(24px) saturate(1.5)',
        borderRadius: 26,
        border: `1px solid ${isError ? 'rgba(184,50,41,0.35)' : 'rgba(0,0,0,0.07)'}`,
        fontFamily: '"Noto Sans SC", system-ui, sans-serif',
        fontSize: 13,
        color: '#15130f',
        boxSizing: 'border-box',
      }}
    >
      {isError ? (
        <div style={{ flex: 1, color: '#b83229', fontWeight: 500 }}>{error}</div>
      ) : isProcessing ? (
        <div style={{ flex: 1, color: '#4a463f' }}>识别中…</div>
      ) : (
        <>
          <div
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11,
              color: '#4a463f',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            ● {mm}:{ss}
          </div>
          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              textAlign: 'right',
              whiteSpace: 'nowrap',
              direction: 'rtl',
              fontWeight: 500,
            }}
            title={partial}
          >
            {partial || '听着…'}
          </div>
        </>
      )}
    </div>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
console.info('[hud] renderer booted')
