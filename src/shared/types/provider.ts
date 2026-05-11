// ASR Provider 抽象接口
//
// 设计契约见 BLUEPRINT.md §D：
//   - audio 输入统一 16kHz mono s16le PCM，由 SessionOrchestrator 喂进来
//   - 非流式 provider（Whisper 等）在 start/pushAudio 内部 buffer，finish 时一次上传
//   - capabilities 决定 UI 行为（partial 文本是否启用、能否提前出字等）
//   - settingsSchema 是 JSON Schema 字符串/对象，Settings UI 用 schema-driven form 渲染

import type { EventEmitter } from 'node:events'

export interface ASRStartOptions {
  sampleRate: 16000
  encoding: 'pcm_s16le'
}

export interface ASRCapabilities {
  /** 真流式 provider 在录音过程中能持续推送 partial */
  streaming: boolean
  /** 是否提供 partial 文本（streaming 通常 true；batch 通常 false） */
  partialResults: boolean
}

export type ASRErrorCode = 'AUTH' | 'QUOTA' | 'NETWORK' | 'PROTOCOL' | 'UNKNOWN'

export interface ASRError {
  code: ASRErrorCode
  message: string
  /** 是否可重试（NETWORK 通常 true；AUTH/QUOTA 通常 false） */
  retryable: boolean
  /** 服务端原始错误码（豆包：20000000 / 45000001 / 等） */
  serverCode?: number
}

/**
 * ASR Provider 统一接口。所有具体实现（Doubao / Whisper / ...）必须满足。
 *
 * 事件：
 *   - 'partial' (text): 中间识别结果；可被新 partial 覆盖
 *   - 'final'   (text): 最终结果；本次会话结束
 *   - 'error'   (err):  失败；会话已终止，不会再有 partial/final
 */
export interface ASRProvider extends EventEmitter {
  readonly id: string
  readonly capabilities: ASRCapabilities
  /** 该 provider 独有的配置字段；Settings UI 据此 schema-driven 渲染 */
  readonly settingsSchema: Record<string, unknown>
  readonly defaults: Record<string, unknown>

  /** 打开 WS / 握手；resolve 后即可 pushAudio */
  start(opts: ASRStartOptions): Promise<void>
  /** 推一帧 PCM（按 BLUEPRINT 约定 40ms × 16kHz × mono × s16le = 1280 字节） */
  pushAudio(chunk: Buffer): void
  /** 标记为最后一帧 + 等待 final 返回；resolve 后 provider 已关闭 */
  finish(): Promise<void>
  /** 立即中止；丢弃未返回结果，关闭连接 */
  abort(): void

  on(event: 'partial', listener: (text: string) => void): this
  on(event: 'final', listener: (text: string) => void): this
  on(event: 'error', listener: (err: ASRError) => void): this

  off(event: 'partial', listener: (text: string) => void): this
  off(event: 'final', listener: (text: string) => void): this
  off(event: 'error', listener: (err: ASRError) => void): this
}
