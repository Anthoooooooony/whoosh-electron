// renderer 端 window.ipc 类型扩展 —— 由 preload 通过 contextBridge 注入
//
// 在所有 renderer main.tsx 中可直接 `window.ipc.invoke(...)` / `window.ipc.send(...)` / `window.ipc.on(...)`
// 并获得 IpcApi 的全套泛型类型推导

/// <reference types="vite/client" />

import type { IpcApi } from '@shared/ipc/types.js'

declare global {
  interface Window {
    ipc: IpcApi
    /**
     * 由 preload 注入的静态平台标识，用于平台相关 UI 分叉。
     * 收窄到 'darwin' | 'win32' —— 本仓只支持这两平台，preload 在打包时不会跑 linux/aix；
     * renderer 直接当 narrow union 用，免去到处运行期 narrow。
     */
    platform: 'darwin' | 'win32'
  }
}

export {}
