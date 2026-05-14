// whoosh-electron · 主进程入口
//
// 责任：
//   - 单实例锁、app lifecycle
//   - permission handler 允许 media（getUserMedia）
//   - 创建四个 BrowserWindow
//   - 初始化 SessionOrchestrator + 注册 IPC handler + 启动 hotkey listener
//   - 从 store + safeStorage 读豆包凭据；`.env` 仍作 dev override 兜底

import { app, session } from 'electron'
import { DoubaoProvider } from '@providers/doubao/index.js'
import { pasteText } from '@native/paste/index.js'
import { registerIpcHandlers } from './ipc/index.js'
import { SessionOrchestrator } from './orchestrator/index.js'
import { createAudioRendererAdapter, createHudAdapter } from './orchestrator/adapters.js'
import { hasEnvCredentials, resolveDoubaoConfig, testDoubaoConnection } from './doubao-config.js'
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
      getProvider: () => {
        const config = resolveDoubaoConfig()
        return config ? new DoubaoProvider(config) : null
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
        if (req.providerId !== 'doubao') {
          return { ok: false, error: `unknown provider ${req.providerId}` }
        }
        return testDoubaoConnection(req.credentials)
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
