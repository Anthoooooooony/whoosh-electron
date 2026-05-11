// whoosh-electron · 主进程入口
//
// 责任：
//   - 单实例锁、app lifecycle
//   - permission handler 允许 media（getUserMedia）
//   - 创建四个 BrowserWindow
//   - 初始化 SessionOrchestrator + 注册 IPC handler + 启动 hotkey listener
//   - dev 模式从 .env 读豆包凭据；M11 会改为从 settings store

import { app, session } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DoubaoProviderConfig } from '@providers/doubao/index.js'
import { registerIpcHandlers } from './ipc/index.js'
import { SessionOrchestrator } from './orchestrator/index.js'
import {
  dispatchCancelClick,
  dispatchSessionDone,
  startHotkeyListener,
  stopHotkeyListener,
} from './hotkey/index.js'
import { createAllWindows, getAppWindows, hideHudWindow, showHudOnActiveScreen } from './windows.js'

/* ───── dev-mode .env 读取（M11 settings 上线后这部分用 store 替代） ───── */

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

function buildDoubaoConfigFromEnv(env: Record<string, string>): DoubaoProviderConfig | null {
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

/* ───── lifecycle ───── */

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // M11 落地：把 settings 窗口 show + focus
  })

  app.whenReady().then(() => {
    // 允许 audio renderer 调 getUserMedia（macOS 系统级 mic 权限另外谈）
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media')
    })

    createAllWindows()

    // dev 凭据
    const env = loadDotEnv()
    const doubaoConfig: DoubaoProviderConfig | null = buildDoubaoConfigFromEnv(env)
    if (doubaoConfig) {
      console.info('[main] Doubao config loaded from .env')
    } else {
      console.warn('[main] no Doubao credentials configured; sessions will surface AUTH error')
    }

    const orchestrator = new SessionOrchestrator({
      getDoubaoConfig: () => doubaoConfig,
      getAudioWebContents: () => getAppWindows()?.audio.webContents,
      getHudWebContents: () => getAppWindows()?.hud.webContents,
      showHudWindow: () => showHudOnActiveScreen(),
      hideHudWindow: () => hideHudWindow(),
      notifyHotkeyDone: () => dispatchSessionDone(),
    })

    registerIpcHandlers({
      onAudioChunk: (chunk) => orchestrator.handleAudioChunk(chunk),
      onHudCancel: () => dispatchCancelClick(),
    })

    startHotkeyListener((action) => orchestrator.handleHotkeyAction(action))
  })

  app.on('will-quit', () => {
    stopHotkeyListener()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
