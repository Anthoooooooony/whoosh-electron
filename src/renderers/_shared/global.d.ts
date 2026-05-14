// renderer 端 window.ipc 类型扩展 —— 由 preload 通过 contextBridge 注入
//
// 在所有 renderer main.tsx 中可直接 `window.ipc.invoke(...)` / `window.ipc.send(...)` / `window.ipc.on(...)`
// 并获得 IpcApi 的全套泛型类型推导

/// <reference types="vite/client" />

import type { IpcApi } from '@shared/ipc/types.js'

declare global {
  interface Window {
    ipc: IpcApi
    /** 由 preload 注入的静态平台标识，用于平台相关 UI 分叉 */
    platform: 'darwin' | 'win32' | 'linux'
  }
}

export {}
