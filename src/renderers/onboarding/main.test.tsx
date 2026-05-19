// Onboarding renderer smoke test
//
// 同 settings 思路：render 同步阶段 state 仍是 null，命中「加载中…」分支，
// 验 import → render 链路 OK 即可。useEffect 里的 ONBOARDING_GET_STEP 由
// test-setup.ts 的 ipc mock 给默认值（step: 1, platform: 'darwin'），不会爆。

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './main.js'

describe('onboarding renderer · smoke', () => {
  it('renders without throwing', () => {
    const { container } = render(<App />)
    expect(container.firstChild).toBeTruthy()
  })
})
