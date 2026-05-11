// Native paste addon —— JS 侧入口
//
// 加载策略：
//   - dev: 从项目根的 build/Release/paste.node 加载（@electron/rebuild 输出位置）
//   - prod（M16 落地）: 从 process.resourcesPath/prebuilds/{platform}-{arch}/paste.node 加载
//
// JS 接口同步语义：main 端阻塞调用即可；native 内部会异步处理 400ms 后的剪贴板恢复
// （macOS GCD dispatch_after，Windows std::thread）。

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

export interface PasteOptions {
  preserveClipboard?: boolean
  markTransient?: boolean
}

interface NativeAddon {
  pasteText(text: string, opts: { preserveClipboard: boolean; markTransient: boolean }): void
}

function loadAddon(): NativeAddon {
  // dev: electron-rebuild 输出到 src/native/paste/build/Release/paste.node
  // dev 时 electron-vite 从项目根启动，process.cwd() 即项目根
  const devPath = join(process.cwd(), 'src', 'native', 'paste', 'build', 'Release', 'paste.node')
  try {
    return require(devPath) as NativeAddon
  } catch {
    // 兜底：相对 main 输出目录（M16 生产打包改读 prebuilds）
    const fallback = join(
      __dirname,
      '..',
      '..',
      '..',
      'src',
      'native',
      'paste',
      'build',
      'Release',
      'paste.node',
    )
    return require(fallback) as NativeAddon
  }
}

let cached: NativeAddon | null = null
function addon(): NativeAddon {
  cached ??= loadAddon()
  return cached
}

export function pasteText(text: string, opts: PasteOptions = {}): void {
  addon().pasteText(text, {
    preserveClipboard: opts.preserveClipboard ?? true,
    markTransient: opts.markTransient ?? true,
  })
}
