import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

// M2 占位：完整的 sidebar + 5 个 section 由 M11 落地
// M3 烟囱：调用 settings:get 验证 IPC 通路
function App(): React.ReactElement {
  const [ipcResult, setIpcResult] = useState<string>('（loading）')

  useEffect(() => {
    void (async (): Promise<void> => {
      if (!window.ipc) {
        setIpcResult('window.ipc undefined —— preload 未注入')
        return
      }
      try {
        const cfg = await window.ipc.invoke('settings:get')
        setIpcResult(`settings:get → ${JSON.stringify(cfg, null, 2)}`)
      } catch (err) {
        setIpcResult(`error: ${String(err)}`)
      }
    })()
  }, [])

  return (
    <div
      style={{
        fontFamily: '"Noto Sans SC", system-ui, sans-serif',
        background: '#F5F2EB',
        color: '#15130f',
        minHeight: '100vh',
        padding: '48px 56px',
      }}
    >
      <h1 style={{ fontFamily: '"Noto Serif SC", serif', fontWeight: 600, margin: 0 }}>
        whoosh · 偏好设置
      </h1>
      <p style={{ marginTop: 12, color: '#8a8478' }}>M11 阶段会替换为完整的 5 个 section 面板。</p>
      <pre
        style={{
          marginTop: 24,
          padding: 16,
          background: '#FFFFFF',
          border: '1px solid #E2DCCD',
          borderRadius: 8,
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 11,
          color: '#4A463F',
          whiteSpace: 'pre-wrap',
        }}
      >
        {ipcResult}
      </pre>
    </div>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
