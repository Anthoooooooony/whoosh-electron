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
  // 生产：electron-builder extraResources 把 .node 复制到 process.resourcesPath/paste.node
  // dev: electron-rebuild 输出在 src/native/paste/build/Release/paste.node
  const candidates: string[] = []
  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    candidates.push(join(process.resourcesPath, 'paste.node'))
  }
  candidates.push(join(process.cwd(), 'src', 'native', 'paste', 'build', 'Release', 'paste.node'))
  candidates.push(
    join(__dirname, '..', '..', '..', 'src', 'native', 'paste', 'build', 'Release', 'paste.node'),
  )
  let lastErr: unknown
  for (const p of candidates) {
    try {
      return require(p) as NativeAddon
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(`paste.node not found; tried: ${candidates.join(', ')}; last: ${String(lastErr)}`)
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
