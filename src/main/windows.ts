// 四个 BrowserWindow 的创建与管理
//
// audio：常驻隐藏 renderer，承载 getUserMedia + AudioWorklet
// hud：底部胶囊，启动隐藏；orchestrator 在 START_RECORDING 后 50ms 才调 showHud()
//      避免误触闪烁，松开/失败时调 hideHud()
// settings / onboarding：按需打开

import { BrowserWindow, screen } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = !!process.env['ELECTRON_RENDERER_URL']

type RendererName = 'audio' | 'hud' | 'settings' | 'onboarding'

function rendererURL(name: RendererName): string {
  if (isDev) return `${process.env['ELECTRON_RENDERER_URL']}/${name}/index.html`
  return pathToFileURL(join(__dirname, '..', 'renderer', name, 'index.html')).toString()
}

function preloadPath(name: RendererName): string {
  return join(__dirname, '..', 'preload', `${name}.mjs`)
}

const HUD_WIDTH = 304
const HUD_HEIGHT = 52
const HUD_BOTTOM_GAP = 72

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
  audio.loadURL(rendererURL('audio'))
  if (isDev) {
    audio.webContents.on('console-message', (e) => {
      console.info(`[audio-renderer] ${e.message}`)
    })
  }

  const hud = new BrowserWindow({
    width: HUD_WIDTH,
    height: HUD_HEIGHT,
    show: false, // orchestrator 在 START_RECORDING 后 50ms 才 show
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false, // 关键：HUD 浮窗绝不抢前台 app 焦点
    alwaysOnTop: true,
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      preload: preloadPath('hud'),
    },
  })
  hud.setAlwaysOnTop(true, 'screen-saver')
  hud.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hud.loadURL(rendererURL('hud'))
  if (isDev) {
    hud.webContents.on('console-message', (e) => {
      console.info(`[hud-renderer] ${e.message}`)
    })
  }

  const settings = new BrowserWindow({
    width: 880,
    height: 580,
    show: false, // main 进程根据 onboarding 状态决定 show；M14 menubar/tray 后默认不显示
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
    show: false, // main 根据 onboarding.done 决定首次展示
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

/**
 * 把 HUD 定位到鼠标所在屏幕的底部居中，调 showInactive 不抢焦点。
 * 多显示器时跟随 active screen。
 */
export function showHudOnActiveScreen(): void {
  const w = windows?.hud
  if (!w || w.isDestroyed()) return
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const wa = display.workArea
  const size = w.getSize()
  const width = size[0] ?? HUD_WIDTH
  const height = size[1] ?? HUD_HEIGHT
  w.setPosition(
    wa.x + Math.round((wa.width - width) / 2),
    wa.y + wa.height - height - HUD_BOTTOM_GAP,
  )
  // showInactive 显示但不激活——不会从前台 app 抢走焦点
  w.showInactive()
}

export function hideHudWindow(): void {
  const w = windows?.hud
  if (!w || w.isDestroyed()) return
  w.hide()
}
