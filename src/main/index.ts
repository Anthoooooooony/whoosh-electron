// whoosh-electron · 主进程入口
// M2 阶段：app lifecycle + single-instance lock + 四个 BrowserWindow 创建
// 后续 milestone 在 ready 之后逐步挂载：M3 IPC、M5 uiohook、M9 SessionOrchestrator…

import { app } from 'electron'
import { createAllWindows } from './windows.js'

// 单例锁；第二实例启动时唤起已有实例的主面板
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // M11 落地：把 settings 窗口 show + focus
  })

  app.whenReady().then(() => {
    createAllWindows()
  })

  // macOS：所有窗口关掉不退出（menubar/tray 模式由 M14 落地）
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
