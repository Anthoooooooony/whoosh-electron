// GitHub Releases 被动版本检查
//
// 流程：
//   - app ready 时调一次 checkOnce()
//   - 之后每 6h 重复一次
//   - 比当前 app.getVersion() 新，则把信息写到 tray 菜单 + 暴露给 settings invoke
//
// 不下载、不替换二进制；自用规模 + 未签名分发选定的策略（BLUEPRINT §14）。

import { app } from 'electron'
import { setUpdateInfo } from '../tray.js'

const REPO_OWNER = 'Anthoooooooony'
const REPO_NAME = 'whoosh-electron'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6h

let timer: ReturnType<typeof setInterval> | null = null
let latestKnown: { version: string; url: string } | null = null

interface CheckResult {
  hasUpdate: boolean
  version?: string
  url?: string
}

export function startPeriodicUpdateCheck(): void {
  if (timer) return
  // 不等待 boot 完成；fire-and-forget
  void checkOnce()
  timer = setInterval(() => void checkOnce(), CHECK_INTERVAL_MS)
}

export function stopPeriodicUpdateCheck(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export async function checkOnce(): Promise<CheckResult> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'whoosh-electron' },
      },
    )
    if (!res.ok) {
      // 仓库还没 release / 网络异常都走这条分支
      return { hasUpdate: false }
    }
    const data = (await res.json()) as { tag_name?: unknown; html_url?: unknown }
    const tag = typeof data.tag_name === 'string' ? data.tag_name : ''
    const url = typeof data.html_url === 'string' ? data.html_url : ''
    if (!tag) return { hasUpdate: false }
    const latestVer = tag.replace(/^v/, '')
    const currentVer = app.getVersion()
    if (compareSemver(latestVer, currentVer) > 0) {
      latestKnown = { version: latestVer, url }
      setUpdateInfo(latestKnown)
      return { hasUpdate: true, version: latestVer, url }
    }
    latestKnown = null
    setUpdateInfo(null)
    return { hasUpdate: false }
  } catch (err) {
    console.warn('[updater] check failed:', err)
    return { hasUpdate: false }
  }
}

export function getLatestKnown(): { version: string; url: string } | null {
  return latestKnown
}

/* ───── helpers ───── */

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((s) => Number.parseInt(s, 10) || 0)
  const pb = b.split('.').map((s) => Number.parseInt(s, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
