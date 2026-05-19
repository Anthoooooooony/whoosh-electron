// debugTranscript —— 受 logging.verbose toggle 控制的薄日志层
//
// 设计：
//   - 默认（verbose=false）零调用，零 console 输出 —— 守住 CLAUDE.md 的隐私底线：
//     info 级路径绝不写转录文本
//   - verbose=true 时把 label + 任意 fields（含 transcript text）写到 console.debug
//   - 直接读 store 的 logging.verbose 字段，跳过整 schema 的 zod safeParse 开销：
//     partial 帧 5-10 次/秒 走全 schema 校验过重；不缓存以让 toggle 切换立刻生效
//
// 调用点限定：
//   - SessionOrchestrator.onProviderPartial / onProviderFinal
//   仅在 orchestrator（main 进程内）使用；不要从 provider 层调，保持 provider 抽象纯净

import { isVerboseLoggingEnabled } from './store/index.js'

export function debugTranscript(label: string, fields: Record<string, unknown>): void {
  if (!isVerboseLoggingEnabled()) return
  console.debug('[transcript]', label, fields)
}
