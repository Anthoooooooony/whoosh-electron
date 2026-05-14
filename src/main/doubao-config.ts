// 豆包 ASR provider 的配置解析 —— 单一来源
//
// 凭据有两个来源，优先级：`.env`（dev override）> 持久化 store。
//   - resolveDoubaoConfig()         —— 运行态：合并 .env + store，供 orchestrator 的 getProvider 用
//   - doubaoConfigFromCredentials() —— onboarding / settings 的 Test Connection 表单凭据
//   - testDoubaoConnection()        —— 用候选凭据真连一次握手验证可用
//
// `.env` 运行期不变，首次读后 memoize；store 每次读新（用户可在 Settings 改）。
// 纯塑形函数 fromEnv / fromStore / doubaoConfigFromCredentials 是 internal seam，
// 由 doubao-config.test.ts 直接覆盖；resolveDoubaoConfig 是读真实来源的薄组合，不单测。

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DoubaoProvider, type DoubaoProviderConfig } from '@providers/doubao/index.js'
import { getApiKey, getConfig } from './store/index.js'

/* ───── .env（dev override），lazy + memoized ───── */

function loadDotEnv(): Record<string, string> {
  const envPath = join(process.cwd(), '.env')
  try {
    const raw = readFileSync(envPath, 'utf8')
    const out: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx < 0) continue
      const key = trimmed.slice(0, idx).trim()
      let value = trimmed.slice(idx + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

let envCache: Record<string, string> | null = null
function getEnv(): Record<string, string> {
  if (envCache === null) envCache = loadDotEnv()
  return envCache
}

/* ───── 纯塑形函数（internal seam，直接测） ───── */

/** `.env` 环境变量 → DoubaoProviderConfig；缺凭据返回 null。apiKey 优先于 appKey/accessKey */
export function fromEnv(env: Record<string, string>): DoubaoProviderConfig | null {
  const apiKey = env['DOUBAO_API_KEY']
  const appKey = env['DOUBAO_APP_KEY']
  const accessKey = env['DOUBAO_ACCESS_KEY']
  if (!apiKey && !(appKey && accessKey)) return null

  const config: DoubaoProviderConfig = apiKey
    ? { auth: { mode: 'new', apiKey } }
    : { auth: { mode: 'old', appKey: appKey!, accessKey: accessKey! } }

  if (env['DOUBAO_RESOURCE_ID']) config.resourceId = env['DOUBAO_RESOURCE_ID']
  if (env['DOUBAO_ENDPOINT_KEY']) {
    config.endpointKey = env['DOUBAO_ENDPOINT_KEY'] as DoubaoProviderConfig['endpointKey']
  }
  return config
}

/** store 里允许进 request 的字段白名单 —— 其余键一律丢弃 */
const STORE_REQUEST_FIELDS = [
  'language',
  'enable_punc',
  'enable_itn',
  'enable_ddc',
  'show_utterances',
] as const

/** 持久化 store 的 provider 配置 + 解密后 apiKey → DoubaoProviderConfig；无 apiKey 返回 null */
export function fromStore(
  providerCfg: Record<string, unknown>,
  apiKey: string | null,
): DoubaoProviderConfig | null {
  if (!apiKey) return null

  const resourceId =
    typeof providerCfg['resourceId'] === 'string' ? providerCfg['resourceId'] : undefined
  const endpointKey =
    typeof providerCfg['endpointKey'] === 'string'
      ? (providerCfg['endpointKey'] as DoubaoProviderConfig['endpointKey'])
      : undefined

  const request: NonNullable<DoubaoProviderConfig['request']> = {}
  for (const k of STORE_REQUEST_FIELDS) {
    const v = providerCfg[k]
    if (v !== undefined) request[k] = v as never
  }

  const out: DoubaoProviderConfig = { auth: { mode: 'new', apiKey } }
  if (resourceId) out.resourceId = resourceId
  if (endpointKey) out.endpointKey = endpointKey
  if (Object.keys(request).length > 0) out.request = request
  return out
}

/** Test Connection 表单的裸凭据 → DoubaoProviderConfig；缺 apiKey 返回 null */
export function doubaoConfigFromCredentials(
  raw: Record<string, unknown>,
): DoubaoProviderConfig | null {
  const apiKey = typeof raw['apiKey'] === 'string' ? raw['apiKey'] : undefined
  if (!apiKey) return null
  const config: DoubaoProviderConfig = { auth: { mode: 'new', apiKey } }
  const resourceId = typeof raw['resourceId'] === 'string' ? raw['resourceId'] : undefined
  if (resourceId) config.resourceId = resourceId
  return config
}

/* ───── 薄组合（读真实 .env + store；不单测） ───── */

/** orchestrator getProvider 用：`.env`（优先）与 store 合并 */
export function resolveDoubaoConfig(): DoubaoProviderConfig | null {
  const envConfig = fromEnv(getEnv())
  if (envConfig) return envConfig
  const providerCfg = getConfig().providers['doubao'] ?? {}
  return fromStore(providerCfg, getApiKey('doubao'))
}

/** boot 诊断：dev `.env` override 是否生效 */
export function hasEnvCredentials(): boolean {
  return fromEnv(getEnv()) !== null
}

/** 用候选凭据真连一次握手（不发音频，建连成功即认为可用） */
export async function testDoubaoConnection(
  raw: Record<string, unknown>,
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const config = doubaoConfigFromCredentials(raw)
  if (!config) return { ok: false, error: '缺少 apiKey 字段' }

  const provider = new DoubaoProvider(config)
  const t0 = Date.now()
  try {
    await provider.start({ sampleRate: 16000, encoding: 'pcm_s16le' })
    provider.abort()
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch (err) {
    provider.abort()
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
