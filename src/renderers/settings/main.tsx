import { createRoot } from 'react-dom/client'

// M2 占位：完整的 sidebar + 5 个 section 由 M11 落地
function App(): React.ReactElement {
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
    </div>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
