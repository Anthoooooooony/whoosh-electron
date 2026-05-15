// 跳转系统设置的隐私面板 —— tray 菜单与 onboarding 的 open-system-prefs 共用
//
// macOS 用 x-apple.systempreferences: URL scheme，Windows 用 ms-settings:。
// Linux 无统一方案，静默 no-op。

import { shell } from 'electron'

export type PrefPane = 'accessibility' | 'microphone'

export function openSystemPrefPane(pane: PrefPane): void {
  if (process.platform === 'darwin') {
    void shell.openExternal(
      pane === 'accessibility'
        ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
        : 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    )
  } else if (process.platform === 'win32') {
    void shell.openExternal(
      pane === 'microphone' ? 'ms-settings:privacy-microphone' : 'ms-settings:privacy',
    )
  }
}
