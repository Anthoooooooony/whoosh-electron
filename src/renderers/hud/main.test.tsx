// HUD renderer smoke test
//
// HUD 初始 state === 'hidden' → render 返回 null，container 为空但**没抛**就算过。
// 这正是 HUD 的初始可观察 contract：未收到 hud:show 之前不该有任何 DOM。

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './main.js'

describe('hud renderer · smoke', () => {
  it('renders to empty container in hidden state without throwing', () => {
    const { container } = render(<App />)
    // 初始 hidden 态返回 null —— 关键是 render 调用本身没抛。
    expect(container.childNodes.length).toBe(0)
  })
})
