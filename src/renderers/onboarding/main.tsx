import { createRoot } from 'react-dom/client'

// M2 占位：完整的 4 步引导由 M12 落地
function App(): React.ReactElement {
  return (
    <div
      style={{
        fontFamily: '"Noto Sans SC", system-ui, sans-serif',
        background: '#FBF8F1',
        color: '#15130f',
        minHeight: '100vh',
        padding: '48px 56px',
      }}
    >
      <h1 style={{ fontFamily: '"Noto Serif SC", serif', fontWeight: 600, margin: 0 }}>
        欢迎使用 whoosh
      </h1>
      <p style={{ marginTop: 12, color: '#8a8478' }}>M12 阶段会替换为完整的 4 步引导。</p>
    </div>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
