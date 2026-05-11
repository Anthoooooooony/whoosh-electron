// 四个 BrowserWindow 的创建与管理
// M2 阶段：让窗口都能加载对应 renderer；不上 panel type / always-on-top / 等高级特性
// 那些都会在 M10（HUD 视觉）/ M11（设置）/ M12（Onboarding）阶段补全

import { BrowserWindow, screen } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = !!process.env['ELECTRON_RENDERER_URL']

type RendererName = 'audio' | 'hud' | 'settings' | 'onboarding'

function rendererURL(name: RendererName): string {
  // dev: vite 的 root 配为 src/renderers/，所以服务在 /{name}/index.html
  if (isDev) return `${process.env['ELECTRON_RENDERER_URL']}/${name}/index.html`
  // 生产：renderer 打到 out/renderer/{name}/index.html，main 在 out/main，路径相对
  return pathToFileURL(join(__dirname, '..', 'renderer', name, 'index.html')).toString()
}

function preloadPath(name: RendererName): string {
  // electron-vite 输出为 ESM（.mjs）；main 进程位于 out/main，preload 在 out/preload
  return join(__dirname, '..', 'preload', `${name}.mjs`)
}

export interface AppWindows {
  audio: BrowserWindow
  hud: BrowserWindow
  settings: BrowserWindow
  onboarding: BrowserWindow
}

let windows: AppWindows | null = null

export function getAppWindows(): AppWindows | null {
  return windows
}

export function createAllWindows(): AppWindows {
  const audio = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      preload: preloadPath('audio'),
    },
  })
  if (isDev) {
    // 先挂监听再 loadURL，确保初始加载阶段的 console / 错误都能被捕获
    audio.webContents.on('console-message', (e) => {
      console.info(`[audio-renderer] ${e.message}`)
    })
    audio.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(`[audio-renderer] did-fail-load ${code} ${desc} url=${url}`)
    })
    audio.webContents.on('render-process-gone', (_e, details) => {
      console.error(`[audio-renderer] render-process-gone`, details)
    })
    audio.webContents.openDevTools({ mode: 'detach' })
  }
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
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      preload: preloadPath('hud'),
    },
  })
  hud.loadURL(rendererURL('hud'))

  const settings = new BrowserWindow({
    width: 880,
    height: 580,
    show: true,
    title: 'whoosh — 偏好设置',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      preload: preloadPath('settings'),
    },
  })
  settings.loadURL(rendererURL('settings'))
  if (isDev) settings.webContents.openDevTools({ mode: 'detach' })

  const onboarding = new BrowserWindow({
    width: 580,
    height: 680,
    show: true,
    title: '欢迎使用 whoosh',
    resizable: false,
    minimizable: false,
    maximizable: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      preload: preloadPath('onboarding'),
    },
  })
  onboarding.loadURL(rendererURL('onboarding'))

  windows = { audio, hud, settings, onboarding }
  return windows
}
