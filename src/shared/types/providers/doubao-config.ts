// 豆包 provider 在 store / IPC 边界上暴露的「子配置」schema
//
// 设计动机：
//   - 之前 AppConfigSchema 把 providers 字段塌成 `z.record(z.string(), z.unknown())`，
//     renderer 拿到后只能 `as string` 强转，破坏了 zod 双端校验的承诺
//   - 每个 provider 把自己暴露给 store / Settings UI 的字段在 shared/types 里
//     声明一份 zod schema，main 端的 registry 据此组合 union，renderer 端拿 entry
//     的 configSchema 做 safeParse，把已知字段 narrow 成业务类型
//   - 这里只放「持久化到 store 的子配置」(provider id → record)；API key 不在此处
//     （API key 走 safeStorage，独立通道）
//
// 注意：本文件只放纯 zod schema 与推导类型，不要 import 任何 Node / Electron 代码。
// renderer 也会用到。

import { z } from 'zod'

/** 豆包识别参数白名单 —— 与 main/doubao-config.ts 的 STORE_REQUEST_FIELDS 保持一致 */
export const DoubaoStoreConfigSchema = z
  .object({
    resourceId: z.string().optional(),
    endpointKey: z.enum(['bigmodel_async', 'bigmodel', 'bigmodel_nostream']).optional(),
    authMode: z.enum(['new', 'old']).optional(),
    language: z.string().optional(),
    enable_punc: z.boolean().optional(),
    enable_itn: z.boolean().optional(),
    enable_ddc: z.boolean().optional(),
    show_utterances: z.boolean().optional(),
  })
  // 未声明的键允许存在但被丢弃 —— 给老版本/手工编辑留容错
  .loose()

export type DoubaoStoreConfig = z.infer<typeof DoubaoStoreConfigSchema>
