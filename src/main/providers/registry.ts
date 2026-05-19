// Provider 路由的中心化注册表 —— 所有「按 providerId 分支」的代码都查这里
//
// 设计动机（issue #53）：
//   在引入 registry 之前，main/index.ts 的 getProvider 闭包硬编码 DoubaoProvider；
//   ipc/index.ts 的 testProviderConnection 用 if 链做 providerId 判等；
//   orchestrator 的「未配置 provider」错误文案直接写死「豆包凭据」。
//   每加一个 provider 都要散点修这三处。registry 把这套分支收口到一份元数据。
//
// 注册方式：手动 import 各 provider 的 registry-entry 模块，写入 providerRegistry map。
//   - 不做动态扫描：tree-shaking 友好 + 编译期可见
//   - 每个 provider 自己持有 entry，与 ASRProvider 的领域实现解耦放在
//     src/providers/<id>/registry-entry.ts；本文件只负责聚合
//
// 失败模式：lookup 不命中时返回 undefined / null；调用方各自 surface 用户可读错误。
// 这里不抛异常，因为 currentProviderId 来自持久化 store，可能与代码版本不一致。

import type { z } from 'zod'
import type { AppConfig } from '@shared/ipc/schemas.js'
import type { ASRProvider } from '@shared/types/provider.js'
import { doubaoEntry } from '@providers/doubao/registry-entry.js'

/** testConnection 的返回形状 —— 与 ProviderTestConnectionResponseSchema 同构 */
export interface TestConnectionResult {
  ok: boolean
  latencyMs?: number
  error?: string
}

/**
 * 一个 provider 在 registry 里的全部元数据。
 *
 * TStoreCfg 是该 provider 持久化到 store.providers[id] 的子配置（由 entry.configSchema 校验）；
 * TRuntimeCfg 是 factory 接受的运行态配置，通常 = fromStore 的返回 = 该 provider 构造器签名。
 *
 * 各字段的契约：
 *   - factory(cfg): 建一个 ASRProvider 实例。失败模式应在 fromStore 阶段就过滤掉
 *     （fromStore 返回 null）；factory 本身保持纯构造，不做凭据校验
 *   - fromStore(store, apiKey): 把 store 持久化配置 + safeStorage 解密的 apiKey 塑形成
 *     factory 接受的运行态。任何缺凭据都应返回 null，由 orchestrator 转成 missingCredentialsKey
 *   - testConnection(cfg): 用 candidate 凭据真握手一次；不发音频，建连成功即视为可用
 *   - configSchema: store 子配置的 zod schema，renderer 可用来做 safeParse 去掉 `as string`
 *   - missingCredentialsKey: i18n key（不是文案）；main 进程不直接 t()，由 renderer 在
 *     SESSION_ERROR.i18nKey 收到后调 t() 渲染
 */
export interface ProviderEntry<TStoreCfg = unknown, TRuntimeCfg = unknown> {
  readonly id: string
  readonly factory: (cfg: TRuntimeCfg) => ASRProvider
  readonly fromStore: (store: AppConfig, apiKey: string | null) => TRuntimeCfg | null
  readonly testConnection: (cfg: Record<string, unknown>) => Promise<TestConnectionResult>
  readonly configSchema: z.ZodType<TStoreCfg>
  readonly missingCredentialsKey: string
}

/**
 * 存储面用 any 擦掉两个泛型 —— 运行期把不同 provider 装一篮，
 * 调用方拿到 entry 后再回到自己的具体类型（在 entry 内部 factory/fromStore 仍 type-safe）。
 * 不用 `unknown` 是因为 factory 的 cfg 在参数位置是 contravariant，`unknown` 不收。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyProviderEntry = ProviderEntry<any, any>

/** 注册表本体 —— 手动 import；新 provider 加一行即可 */
export const providerRegistry: Record<string, AnyProviderEntry> = {
  [doubaoEntry.id]: doubaoEntry,
}

/** 安全 lookup：未注册返回 undefined，由调用方按自己的语义决策 */
export function getProviderEntry(id: string): AnyProviderEntry | undefined {
  return providerRegistry[id]
}

/**
 * 测试钩子：允许测试代码注册临时 entry 并保证清理。
 *
 * 不暴露 `register()` 等长期 API，是为了避免代码各处都往 registry 写；
 * 生产路径仍是「在 providerRegistry 字面量加一行」。这里只服务于
 * registry.test.ts 验证「无需改 main/ipc 即可挂一个新 provider」。
 */
export function __registerForTests(entry: AnyProviderEntry): () => void {
  if (providerRegistry[entry.id]) {
    throw new Error(`provider already registered: ${entry.id}`)
  }
  providerRegistry[entry.id] = entry
  return () => {
    delete providerRegistry[entry.id]
  }
}
