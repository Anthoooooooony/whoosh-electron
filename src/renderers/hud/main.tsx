import { createRoot } from 'react-dom/client'

// M2 占位：实际四态胶囊由 M10 落地（按 design/index.html 视觉规范）
function App(): React.ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(248, 244, 234, 0.82)',
        backdropFilter: 'blur(24px) saturate(1.5)',
        borderRadius: 26,
        border: '1px solid rgba(0,0,0,0.07)',
        fontFamily: '"Noto Sans SC", system-ui, sans-serif',
        fontSize: 12,
        color: '#15130f',
        letterSpacing: '0.05em',
      }}
    >
      HUD · placeholder
    </div>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
