// whoosh-electron · 主进程入口
//
// 责任：
//   - 单实例锁、app lifecycle
//   - permission handler 允许 media（getUserMedia）
//   - 创建四个 BrowserWindow
//   - 初始化 SessionOrchestrator + 注册 IPC handler + 启动 hotkey listener
//   - 通过 providerRegistry 路由当前 providerId 到具体 entry；不再硬编码豆包

import { app, session } from 'electron'
import { pasteText } from '@native/paste/index.js'
import { registerIpcHandlers } from './ipc/index.js'
import { SessionOrchestrator } from './orchestrator/index.js'
import { createAudioRendererAdapter, createHudAdapter } from './orchestrator/adapters.js'
import { hasEnvCredentials } from './doubao-config.js'
import { getProviderEntry } from './providers/registry.js'
import type { ASRProvider } from '@shared/types/provider.js'
import {
  dispatchCancelClick,
  dispatchSessionDone,
  startHotkeyListener,
  stopHotkeyListener,
} from './hotkey/index.js'
import { createAllWindows, getAppWindows, markAppQuitting } from './windows.js'
import { getApiKey, getConfig, setApiKey, setConfig } from './store/index.js'
import { createTray, destroyTray } from './tray.js'
import { startPeriodicUpdateCheck, stopPeriodicUpdateCheck } from './updater/index.js'

/** registry 不命中时的兜底 i18n key —— 用于「currentProviderId 与代码版本不一致」 */
const FALLBACK_MISSING_CREDENTIALS_KEY = 'provider.missingCredentials.unknown'

/**
 * 走 registry 解析当前 providerId 的 entry + 实例化。
 * 任一环节失败（id 未注册、fromStore 返 null 即缺凭据）都返回 null，
 * 由 orchestrator 转成 SESSION_ERROR 走 missingCredentialsKey 路径。
 */
function makeCurrentProvider(): ASRProvider | null {
  const cfg = getConfig()
  const entry = getProviderEntry(cfg.currentProviderId)
  if (!entry) {
    console.warn(`[main] provider not registered: ${cfg.currentProviderId}`)
    return null
  }
  const apiKey = getApiKey(entry.id)
  const runtimeCfg = entry.fromStore(cfg, apiKey)
  if (!runtimeCfg) return null
  return entry.factory(runtimeCfg)
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

    // macOS：隐 Dock 图标，跟 menubar 入口对齐 LSUIElement 行为
    if (process.platform === 'darwin') app.dock?.hide()

    createAllWindows()
    createTray()
    startPeriodicUpdateCheck()

    if (hasEnvCredentials()) {
      console.info('[main] Doubao credentials loaded from .env (dev override)')
    }

    const orchestrator = new SessionOrchestrator({
      getProvider: () => makeCurrentProvider(),
      getMissingCredentialsKey: () => {
        const entry = getProviderEntry(getConfig().currentProviderId)
        return entry?.missingCredentialsKey ?? FALLBACK_MISSING_CREDENTIALS_KEY
      },
      hud: createHudAdapter(getAppWindows),
      audio: createAudioRendererAdapter(getAppWindows, getConfig),
      paste: (text) => pasteText(text),
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
        const entry = getProviderEntry(req.providerId)
        if (!entry) return { ok: false, error: `provider-not-registered:${req.providerId}` }
        return entry.testConnection(req.credentials)
      },
    })

    startHotkeyListener((action) => orchestrator.handleHotkeyAction(action))

    // 决定首次展示哪个窗口：onboarding 未完 → 显示 onboarding；
    // 否则什么都不显示——用户从 menubar/tray 打开 settings
    const cfg = getConfig()
    const w = getAppWindows()
    if (!cfg.onboarding.done) {
      w?.onboarding.show()
      w?.onboarding.focus()
    }
  })

  app.on('before-quit', () => {
    markAppQuitting()
  })

  app.on('will-quit', () => {
    stopHotkeyListener()
    destroyTray()
    stopPeriodicUpdateCheck()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
