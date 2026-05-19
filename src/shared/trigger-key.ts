// 触发键的用户可见名称 —— 按平台分叉的单一来源
//
// 实际的 keycode 绑定见 src/main/hotkey/index.ts；本文件只负责 UI 文案。
// macOS 用右 Option，Windows 用右 Ctrl（右 Alt 会激活菜单栏，见 issue #44）。
//
// 本仓只支持 macOS + Windows —— Linux 没有 uiohook prebuild、没有系统级
// 触发键设计，故 Platform 收窄到这两值。运行期遇到非预期 process.platform
// 应在调用方做 fallback（如 main/ipc/index.ts 把未知平台映射成 'win32'），
// 而非在此处兜底，以便误用在类型层就能被发现。

export type Platform = 'darwin' | 'win32'

export function triggerKeyLabel(platform: Platform): string {
  // 显式分支而非 ternary —— 留点空间将来若再加 'linux' 支持时改 exhaustive 检查
  if (platform === 'darwin') return '右 Option'
  if (platform === 'win32') return '右 Ctrl'
  // exhaustiveness guard：上面两分支已覆盖联合类型，此处不可达。
  // 若未来扩了 Platform 而忘了对应分支，TS 会在 _exhaustive 上报错。
  const _exhaustive: never = platform
  throw new Error(`triggerKeyLabel: unsupported platform ${String(_exhaustive)}`)
}
