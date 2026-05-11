// whoosh-electron · 主进程入口
//
// 责任：
//   - 单实例锁、app lifecycle
//   - permission handler 允许 media（getUserMedia）
//   - 创建四个 BrowserWindow
//   - 初始化 SessionOrchestrator + 注册 IPC handler + 启动 hotkey listener
//   - 从 store + safeStorage 读豆包凭据；`.env` 仍作 dev override 兜底

import { app, session } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DoubaoProvider, type DoubaoProviderConfig } from '@providers/doubao/index.js'
import { registerIpcHandlers } from './ipc/index.js'
import { SessionOrchestrator } from './orchestrator/index.js'
import {
  dispatchCancelClick,
  dispatchSessionDone,
  startHotkeyListener,
  stopHotkeyListener,
} from './hotkey/index.js'
import { createAllWindows, getAppWindows, hideHudWindow, showHudOnActiveScreen } from './windows.js'
import { getApiKey, getConfig, setApiKey, setConfig } from './store/index.js'

/* ───── dev .env override（无 .env 则走 store） ───── */

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

function buildDoubaoFromEnv(env: Record<string, string>): DoubaoProviderConfig | null {
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

function buildDoubaoFromStore(): DoubaoProviderConfig | null {
  const cfg = getConfig()
  const providerCfg = cfg.providers['doubao'] ?? {}
  const apiKey = getApiKey('doubao')
  if (!apiKey) return null

  const resourceId =
    typeof providerCfg['resourceId'] === 'string'
      ? (providerCfg['resourceId'] as string)
      : undefined
  const endpointKey =
    typeof providerCfg['endpointKey'] === 'string'
      ? (providerCfg['endpointKey'] as DoubaoProviderConfig['endpointKey'])
      : undefined

  const request: NonNullable<DoubaoProviderConfig['request']> = {}
  for (const k of [
    'language',
    'enable_punc',
    'enable_itn',
    'enable_ddc',
    'show_utterances',
  ] as const) {
    const v = providerCfg[k]
    if (v !== undefined) request[k] = v as never
  }

  const out: DoubaoProviderConfig = { auth: { mode: 'new', apiKey } }
  if (resourceId) out.resourceId = resourceId
  if (endpointKey) out.endpointKey = endpointKey
  if (Object.keys(request).length > 0) out.request = request
  return out
}

function buildDoubaoFromStoreOrEnv(env: Record<string, string>): DoubaoProviderConfig | null {
  return buildDoubaoFromEnv(env) ?? buildDoubaoFromStore()
}

/* ───── lifecycle ───── */

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    getAppWindows()?.settings.show()
    getAppWindows()?.settings.focus()
  })

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media')
    })

    createAllWindows()

    const env = loadDotEnv()
    const hasEnvCreds = !!buildDoubaoFromEnv(env)
    if (hasEnvCreds) console.info('[main] Doubao credentials loaded from .env (dev override)')

    const orchestrator = new SessionOrchestrator({
      getDoubaoConfig: () => buildDoubaoFromStoreOrEnv(env),
      getAudioWebContents: () => getAppWindows()?.audio.webContents,
      getHudWebContents: () => getAppWindows()?.hud.webContents,
      showHudWindow: () => showHudOnActiveScreen(),
      hideHudWindow: () => hideHudWindow(),
      notifyHotkeyDone: () => dispatchSessionDone(),
    })

    registerIpcHandlers({
      onAudioChunk: (chunk) => orchestrator.handleAudioChunk(chunk),
      onHudCancel: () => dispatchCancelClick(),
      getConfig: () => getConfig(),
      setConfig: (patch) => setConfig(patch),
      getApiKey: (id) => getApiKey(id),
      setApiKey: (id, key) => setApiKey(id, key),
      onOnboardingDone: () => {
        const w = getAppWindows()
        w?.onboarding.hide()
        w?.settings.show()
        w?.settings.focus()
      },
      testProviderConnection: async (req) => {
        if (req.providerId !== 'doubao') {
          return { ok: false, error: `unknown provider ${req.providerId}` }
        }
        // 用临时 provider 跑一次握手；不发音频，建连成功即认为可用
        const creds = req.credentials as Record<string, unknown>
        const apiKey = typeof creds['apiKey'] === 'string' ? creds['apiKey'] : undefined
        const resourceId = typeof creds['resourceId'] === 'string' ? creds['resourceId'] : undefined
        if (!apiKey) return { ok: false, error: '缺少 apiKey 字段' }

        const testCfg: DoubaoProviderConfig = { auth: { mode: 'new', apiKey } }
        if (resourceId) testCfg.resourceId = resourceId

        const provider = new DoubaoProvider(testCfg)
        const t0 = Date.now()
        try {
          await provider.start({ sampleRate: 16000, encoding: 'pcm_s16le' })
          provider.abort()
          return { ok: true, latencyMs: Date.now() - t0 }
        } catch (err) {
          provider.abort()
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    })

    startHotkeyListener((action) => orchestrator.handleHotkeyAction(action))

    // 决定首次展示哪个窗口：onboarding 未完 → 显示 onboarding；否则显示 settings
    const cfg = getConfig()
    const w = getAppWindows()
    if (!cfg.onboarding.done) {
      w?.onboarding.show()
      w?.onboarding.focus()
    } else {
      w?.settings.show()
      w?.settings.focus()
    }
  })

  app.on('will-quit', () => {
    stopHotkeyListener()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
