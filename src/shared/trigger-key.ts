// 触发键的用户可见名称 —— 按平台分叉的单一来源
//
// 实际的 keycode 绑定见 src/main/hotkey/index.ts；本文件只负责 UI 文案。
// macOS 用右 Option，Windows 用右 Ctrl（右 Alt 会激活菜单栏，见 issue #44）。

type Platform = 'darwin' | 'win32' | 'linux'

export function triggerKeyLabel(platform: Platform): string {
  return platform === 'darwin' ? '右 Option' : '右 Ctrl'
}
