// 豆包 provider 的 registry entry —— 仅做装配，不引入新业务逻辑
//
// 各字段都是对现有 doubao-config / DoubaoProvider 的薄包装：
//   - factory: 包 new DoubaoProvider(cfg)
//   - fromStore: 复用 main/doubao-config 的 fromStore（store 子配置 + 解密后 apiKey → DoubaoProviderConfig）
//   - testConnection: 复用 main/doubao-config 的 testDoubaoConnection
//
// 为什么把 entry 放在 src/providers/doubao 而不是 src/main/providers/doubao：
//   provider 实现本身就在 src/providers；entry 是该 provider 对外暴露给 registry 的契约，
//   放在同一目录里语义最紧凑。registry-entry 引用了 main 的 doubao-config（fromStore/testDoubaoConnection），
//   两者都跑在 main 进程，不会被 renderer bundle 拉进去。

import {
  fromEnv,
  fromStore as doubaoFromStore,
  getEnv,
  testDoubaoConnection,
} from '@main/doubao-config.js'
import type { AppConfig } from '@shared/ipc/schemas.js'
import {
  DoubaoStoreConfigSchema,
  type DoubaoStoreConfig,
} from '@shared/types/providers/doubao-config.js'
import type { ProviderEntry } from '@main/providers/registry.js'
import { DoubaoProvider, type DoubaoProviderConfig } from './index.js'

export const doubaoEntry: ProviderEntry<DoubaoStoreConfig, DoubaoProviderConfig> = {
  id: 'doubao',
  factory: (cfg) => new DoubaoProvider(cfg),
  fromStore: (store: AppConfig, apiKey: string | null) => {
    // `.env`（dev override）优先于 store —— 与被替换的 resolveDoubaoConfig 保持同一优先级。
    // 不走这一步的话，main/index.ts 启动时的「.env credentials loaded」日志会变成谎言。
    const envConfig = fromEnv(getEnv())
    if (envConfig) return envConfig
    // store.providers[id] 是 record；fromStore 内部已做字段白名单与类型 narrowing
    const raw = store.providers[doubaoEntry.id] ?? {}
    return doubaoFromStore(raw, apiKey)
  },
  testConnection: (credentials) => testDoubaoConnection(credentials),
  configSchema: DoubaoStoreConfigSchema,
  // renderer 看到 SESSION_ERROR.i18nKey 后用 t() 渲染；i18n 资源补在
  // src/shared/locales/{zh-CN,en}.json 的 provider.missingCredentials.doubao
  missingCredentialsKey: 'provider.missingCredentials.doubao',
}
