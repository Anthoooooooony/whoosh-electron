// 跳转系统设置的隐私面板 —— tray 菜单与 onboarding 的 open-system-prefs 共用
//
// macOS 用 x-apple.systempreferences: URL scheme，Windows 用 ms-settings:。
// Linux 无统一方案，静默 no-op。

import { shell } from 'electron'

export type PrefPane = 'accessibility' | 'microphone'

export function openSystemPrefPane(pane: PrefPane): void {
  if (process.platform === 'darwin') {
    // 用 x-apple.systempreferences: URL scheme + Privacy_Accessibility / Privacy_Microphone
    // 这两个 query 在 macOS 14（Sonoma）下行为可能漂移 —— 新版 System Settings 的
    // 隐私分类 URL 已经多次改名，目前本仓只在 macOS 14 上验证过；macOS 15 (Sequoia)
    // 未做真机测试，若发现跳错 pane 需要更新 scheme（自用规模未真机覆盖）。
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
