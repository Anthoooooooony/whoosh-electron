// 共享 preload 实现：通过 contextBridge 把类型化 IpcApi 暴露给 renderer
//
// 设计要点：
//   - invoke：ipcRenderer.invoke 包一层 Promise（main 端 handler 必须返回值）
//   - send：单向，无返回
//   - on：注册监听 + 返回 unsubscribe 函数（renderer effect cleanup 友好）
//
// M3 阶段不做 zod 校验（main 端入参由 ipc/index.ts 校验，renderer 端假定可信）；
// 后续若发现类型漂移可加客户端 schema parse。

import { contextBridge, ipcRenderer } from 'electron'
import type { BroadcastContract, InvokeContract, IpcApi, SendContract } from '@shared/ipc/types.js'

function createIpcApi(): IpcApi {
  return {
    invoke<C extends keyof InvokeContract>(
      channel: C,
      ...args: InvokeContract[C]['req'] extends void ? [] : [InvokeContract[C]['req']]
    ): Promise<InvokeContract[C]['res']> {
      return ipcRenderer.invoke(channel, ...args) as Promise<InvokeContract[C]['res']>
    },

    send<C extends keyof SendContract>(
      channel: C,
      ...args: SendContract[C] extends void ? [] : [SendContract[C]]
    ): void {
      ipcRenderer.send(channel, ...args)
    },

    on<C extends keyof BroadcastContract>(
      channel: C,
      handler: (
        payload: BroadcastContract[C] extends void ? undefined : BroadcastContract[C],
      ) => void,
    ): () => void {
      const wrapped = (_event: unknown, payload: unknown): void => {
        handler(payload as BroadcastContract[C] extends void ? undefined : BroadcastContract[C])
      }
      ipcRenderer.on(channel, wrapped)
      return () => {
        ipcRenderer.off(channel, wrapped)
      }
    },
  }
}

export function exposeIpcBridge(): void {
  contextBridge.exposeInMainWorld('ipc', createIpcApi())
}
