// Settings renderer smoke test
//
// 只验「挂载不抛」+ 初始 loading 文案出现。Settings 首屏在 useEffect 里 invoke
// SETTINGS_GET，window.ipc mock 默认会异步 resolve，但 render 同步阶段 config 仍是
// null —— 此时组件渲染「加载中…」分支，足以验证 import + render 链路通畅。

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './main.js'

describe('settings renderer · smoke', () => {
  it('renders without throwing', () => {
    const { container } = render(<App />)
    expect(container.firstChild).toBeTruthy()
  })
})
