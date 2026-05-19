// Native paste addon —— JS 侧入口
//
// 加载策略：
//   - dev: 从项目根的 build/Release/paste.node 加载（@electron/rebuild 输出位置）
//   - prod（M16 落地）: 从 process.resourcesPath/prebuilds/{platform}-{arch}/paste.node 加载
//
// JS 接口同步语义：main 端阻塞调用即可；native 内部会异步处理 400ms 后的剪贴板恢复
// （macOS GCD dispatch_after，Windows std::thread）。
//
// 失败处理（issue #60）：模块级别**不再** throw —— 否则 main/index.ts 一旦 import
// 即崩，整 app 起不来；orchestrator paste 调用处也只能 console.warn 兜底，session 末端
// 静默丢字。改成懒加载 + 返回 PasteResult discriminated union，让 orchestrator 把失败
// 翻译成 SESSION_ERROR 给 HUD。

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

/**
 * 三态结果：
 *   - ok: 调用成功
 *   - addon-unavailable: addon 加载失败（CI 漏 prebuild / 用户安装包损坏）
 *   - paste-failed: addon 已加载但调用抛错（OS-level paste failed —— 罕见，
 *     如 macOS Accessibility 权限被撤销）
 */
export type PasteResult =
  | { ok: true }
  | { ok: false; reason: 'addon-unavailable'; detail: string }
  | { ok: false; reason: 'paste-failed'; detail: string }

function tryLoadAddon(): { addon: NativeAddon } | { error: string } {
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
      return { addon: require(p) as NativeAddon }
    } catch (err) {
      lastErr = err
    }
  }
  return {
    error: `paste.node not found; tried: ${candidates.join(', ')}; last: ${String(lastErr)}`,
  }
}

let cached: { addon: NativeAddon } | { error: string } | null = null

function getAddon(): { addon: NativeAddon } | { error: string } {
  cached ??= tryLoadAddon()
  return cached
}

export function pasteText(text: string, opts: PasteOptions = {}): PasteResult {
  const loaded = getAddon()
  if ('error' in loaded) {
    return { ok: false, reason: 'addon-unavailable', detail: loaded.error }
  }
  try {
    loaded.addon.pasteText(text, {
      preserveClipboard: opts.preserveClipboard ?? true,
      markTransient: opts.markTransient ?? true,
    })
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      reason: 'paste-failed',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

/** 测试用 —— 重置缓存的 addon 加载结果 */
export function __resetAddonCacheForTests(): void {
  cached = null
}
