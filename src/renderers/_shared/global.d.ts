// renderer 端 window.ipc 类型扩展 —— 由 preload 通过 contextBridge 注入
//
// 在所有 renderer main.tsx 中可直接 `window.ipc.invoke(...)` / `window.ipc.send(...)` / `window.ipc.on(...)`
// 并获得 IpcApi 的全套泛型类型推导

import type { IpcApi } from '@shared/ipc/types.js'

declare global {
  interface Window {
    ipc: IpcApi
  }
}

export {}
