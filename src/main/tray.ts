// macOS menubar / Windows tray icon
//
// 跨平台对称的「后台 utility」：
//   - macOS：app.dock.hide() + NSStatusItem (Tray)；不占 Dock 与 ⌘Tab
//   - Windows：系统托盘 Tray；不占任务栏
//
// 图标用一个 22×22 的简单麦克风轮廓 PNG，在主进程启动时动态生成（避免提交二进制资源）。
// macOS 上调 setTemplateImage(true)，自动跟随 light/dark 菜单栏色。
//
// 右键菜单：
//   Open Settings
//   ───
//   Microphone Access: ✓/✗   (点击跳系统设置)
//   Accessibility Access: ✓/✗ (仅 macOS，点击跳系统设置)
//   ───
//   Update available: vX.Y.Z (有新版时才显示，M15 实现)
//   ───
//   Quit

import { Menu, Tray, app, nativeImage, shell, systemPreferences } from 'electron'
import { deflateSync } from 'node:zlib'
import { getAppWindows } from './windows.js'

let tray: Tray | null = null

interface TrayState {
  updateInfo: { version: string; url: string } | null
}
const state: TrayState = { updateInfo: null }

/* ───────────────────────────────────────────
   icon generation (22×22 template PNG)
   ─────────────────────────────────────────── */

function crc32(data: Buffer): number {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  let crc = 0xffffffff
  for (const byte of data) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function generateMicIcon(): Buffer {
  const W = 22
  const H = 22
  // RGBA raw; filter type 0 per row
  const raw = Buffer.alloc(H * (1 + W * 4))
  for (let y = 0; y < H; y++) {
    const off = y * (1 + W * 4)
    raw[off] = 0
    for (let x = 0; x < W; x++) {
      const px = off + 1 + x * 4
      // 麦克风轮廓：胶囊头 + 立柱 + 横底
      const inHead = x >= 8 && x <= 13 && y >= 4 && y <= 13
      const inHeadRound =
        ((x === 7 || x === 14) && y >= 5 && y <= 12) ||
        (x === 8 && y === 4) ||
        (x === 13 && y === 4)
      const inStand = y >= 16 && y <= 17 && x >= 7 && x <= 14
      const inHandle = (x === 10 || x === 11) && y >= 13 && y <= 16
      const filled = inHead || inHeadRound || inStand || inHandle
      raw[px] = 0
      raw[px + 1] = 0
      raw[px + 2] = 0
      raw[px + 3] = filled ? 255 : 0
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/* ───────────────────────────────────────────
   tray lifecycle
   ─────────────────────────────────────────── */

export function createTray(): Tray {
  if (tray) return tray
  const iconBytes = generateMicIcon()
  const icon = nativeImage.createFromBuffer(iconBytes)
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('whoosh · 语音输入法')
  tray.on('click', () => {
    if (process.platform !== 'darwin') openSettings()
  })
  void rebuildMenu()
  return tray
}

export function setUpdateInfo(info: { version: string; url: string } | null): void {
  state.updateInfo = info
  void rebuildMenu()
}

export async function rebuildMenu(): Promise<void> {
  if (!tray) return
  const mic = await getMicPermissionStatus()
  const acc = process.platform === 'darwin' ? getAccessibilityStatus() : null

  const items: Electron.MenuItemConstructorOptions[] = [
    { label: '打开设置', click: () => openSettings() },
    { type: 'separator' },
    {
      label: `麦克风权限：${mic ? '✓ 已授权' : '✗ 未授权'}`,
      click: () => {
        if (process.platform === 'darwin') {
          void shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
          )
        } else if (process.platform === 'win32') {
          void shell.openExternal('ms-settings:privacy-microphone')
        }
      },
    },
  ]
  if (acc !== null) {
    items.push({
      label: `辅助功能权限：${acc ? '✓ 已授权' : '✗ 未授权'}`,
      click: () => {
        void shell.openExternal(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
        )
      },
    })
  }
  if (state.updateInfo) {
    items.push(
      { type: 'separator' },
      {
        label: `有新版本：${state.updateInfo.version}`,
        click: () => {
          if (state.updateInfo) void shell.openExternal(state.updateInfo.url)
        },
      },
    )
  }
  items.push({ type: 'separator' }, { label: '退出 whoosh', click: () => app.quit() })
  tray.setContextMenu(Menu.buildFromTemplate(items))
}

function openSettings(): void {
  const w = getAppWindows()?.settings
  if (!w) return
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}

async function getMicPermissionStatus(): Promise<boolean> {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return systemPreferences.getMediaAccessStatus('microphone') === 'granted'
  }
  return true
}

function getAccessibilityStatus(): boolean {
  return systemPreferences.isTrustedAccessibilityClient(false)
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
