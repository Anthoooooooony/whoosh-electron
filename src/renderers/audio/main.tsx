import { createRoot } from 'react-dom/client'

// 隐藏窗口；视觉不重要，但渲染一行让控制台能确认 audio renderer 已 boot
function App(): React.ReactElement {
  return <span>audio renderer · loaded</span>
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
console.info('[audio] renderer booted')
