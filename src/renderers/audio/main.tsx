// Audio renderer —— hidden BrowserWindow，仅用于跑 Web Audio + AudioWorklet
//
// 渲染 UI 只是个占位的 status 标记，便于打开 DevTools 时一眼看到状态。
// 真正的工作在 bridge.ts 里完成：订阅 main 推送的 audio:start/stop/abort，
// 启停 getUserMedia + AudioWorklet。

import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Channels } from '@shared/ipc/channels.js'
import { startCapture, stopCapture } from './bridge.js'

type Status = 'idle' | 'capturing' | 'error'

function App(): React.ReactElement {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const offStart = window.ipc.on(Channels.AUDIO_START, (payload) => {
      void (async (): Promise<void> => {
        try {
          await startCapture(payload.deviceId)
          setStatus('capturing')
          setErrorMsg(null)
        } catch (err) {
          console.error('[audio] startCapture failed', err)
          setStatus('error')
          setErrorMsg(String(err))
        }
      })()
    })

    const offStop = window.ipc.on(Channels.AUDIO_STOP, () => {
      void (async (): Promise<void> => {
        try {
          await stopCapture()
        } finally {
          setStatus('idle')
        }
      })()
    })

    const offAbort = window.ipc.on(Channels.AUDIO_ABORT, () => {
      void (async (): Promise<void> => {
        try {
          await stopCapture()
        } finally {
          setStatus('idle')
        }
      })()
    })

    return () => {
      offStart()
      offStop()
      offAbort()
    }
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui', padding: 12, fontSize: 12 }}>
      <div>audio renderer · status: {status}</div>
      {errorMsg && <pre style={{ color: 'crimson' }}>{errorMsg}</pre>}
    </div>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
console.info('[audio] renderer booted')
