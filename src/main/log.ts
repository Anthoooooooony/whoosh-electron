// debugTranscript —— 受 logging.verbose toggle 控制的薄日志层
//
// 设计：
//   - 默认（verbose=false）零调用，零 console 输出 —— 守住 CLAUDE.md 的隐私底线：
//     info 级路径绝不写转录文本
//   - verbose=true 时把 label + 任意 fields（含 transcript text）写到 console.debug
//   - getConfig() 是 sync electron-store 读取，open-once 后是 in-memory，性能上每帧 partial
//     直接 read 也无瓶颈；不引入模块级缓存以避免 store 写入后过期的复杂度
//
// 调用点限定：
//   - SessionOrchestrator.onProviderPartial / onProviderFinal
//   仅在 orchestrator（main 进程内）使用；不要从 provider 层调，保持 provider 抽象纯净

import { getConfig } from './store/index.js'

export function debugTranscript(label: string, fields: Record<string, unknown>): void {
  if (!getConfig().logging.verbose) return
  console.debug('[transcript]', label, fields)
}
