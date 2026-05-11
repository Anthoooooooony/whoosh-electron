// 四个 BrowserWindow 的创建与管理
// M2 阶段：让窗口都能加载对应 renderer；不上 panel type / always-on-top / 等高级特性
// 那些都会在 M10（HUD 视觉）/ M11（设置）/ M12（Onboarding）阶段补全

import { BrowserWindow, screen } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = !!process.env['ELECTRON_RENDERER_URL']

function rendererURL(name: 'audio' | 'hud' | 'settings' | 'onboarding'): string {
  if (isDev) return `${process.env['ELECTRON_RENDERER_URL']}/src/renderers/${name}/index.html`
  // 生产：renderer 打到 out/renderer/{name}/index.html，main 在 out/main，路径相对
  return pathToFileURL(join(__dirname, '..', 'renderer', name, 'index.html')).toString()
}

export interface AppWindows {
  audio: BrowserWindow
  hud: BrowserWindow
  settings: BrowserWindow
  onboarding: BrowserWindow
}

export function createAllWindows(): AppWindows {
  const audio = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
    webPreferences: { sandbox: false }, // M3 加 preload + contextIsolation
  })
  audio.loadURL(rendererURL('audio'))

  // HUD：M2 阶段视觉占位，bottom-center 定位、无边框、透明背景
  // 真正的 panel / focusable:false / always-on-top screen-saver 在 M10 落地
  const primary = screen.getPrimaryDisplay().workArea
  const hudWidth = 304
  const hudHeight = 52
  const hud = new BrowserWindow({
    width: hudWidth,
    height: hudHeight,
    x: primary.x + Math.round((primary.width - hudWidth) / 2),
    y: primary.y + primary.height - hudHeight - 72,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: { sandbox: false },
  })
  hud.loadURL(rendererURL('hud'))

  const settings = new BrowserWindow({
    width: 880,
    height: 580,
    show: true,
    title: 'whoosh — 偏好设置',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { sandbox: false },
  })
  settings.loadURL(rendererURL('settings'))

  const onboarding = new BrowserWindow({
    width: 580,
    height: 680,
    show: true,
    title: '欢迎使用 whoosh',
    resizable: false,
    minimizable: false,
    maximizable: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { sandbox: false },
  })
  onboarding.loadURL(rendererURL('onboarding'))

  return { audio, hud, settings, onboarding }
}
