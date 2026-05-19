// DoubaoSession —— 单次会话生命周期
//
// 状态机：
//   idle → connecting → ready → streaming → finishing → closed
//                     ↓                                   ↑
//                   error ─────────────────────────────── ┘
//
// 调用方式（一次性使用，不要复用 session 实例）：
//   const s = new DoubaoSession(config)
//   s.on('partial', ...).on('final', ...).on('error', ...)
//   await s.start()         // 建立 ws 连接 + 发 full client request
//   s.pushAudio(chunk)      // 任意次
//   await s.finish()        // 发最后一帧 + 等 final；resolve 后已 closed
//   // 或:  s.abort()       // 立即关掉
//
// 重连策略：
//   start() 时若 ws connect 失败或握手失败，会自动重连一次（间隔 500ms）；
//   会话期间断线不重连（音频上下文已丢失）。

import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import WebSocket, { type RawData } from 'ws'
import type { ASRError, ASRErrorCode } from '@shared/types/provider.js'
import {
  DEFAULT_ENDPOINT_KEY,
  DEFAULT_RESOURCE_ID,
  Endpoint,
  Header,
  type EndpointKey,
} from './constants.js'
import { MessageType } from './constants.js'
import { decodeFrame, encodeAudioFrame, encodeControlFrame } from './seed-codec.js'

/* ───────────────────────────────────────────────────────────
   config
   ─────────────────────────────────────────────────────────── */

export interface DoubaoAuthNew {
  mode: 'new'
  /** 新版控制台 API Key（UUID） */
  apiKey: string
}

export interface DoubaoAuthOld {
  mode: 'old'
  /** 旧版控制台 App ID（数字） */
  appKey: string
  /** 旧版控制台 Access Token */
  accessKey: string
}

export type DoubaoAuth = DoubaoAuthNew | DoubaoAuthOld

export interface DoubaoSessionConfig {
  auth: DoubaoAuth
  resourceId?: string // 默认 v2_duration (volc.seedasr.sauc.duration)
  endpointKey?: EndpointKey // 默认 bigmodel_async
  /** 完全覆盖 endpoint URL，调试或私有部署用；优先级高于 endpointKey */
  endpointOverride?: string
  /** 识别请求参数；会作为 request.* 字段发给服务端 */
  request?: {
    language?: string
    enable_itn?: boolean
    enable_punc?: boolean
    enable_ddc?: boolean
    show_utterances?: boolean
    [key: string]: unknown
  }
  /** audio 字段；默认 16kHz mono pcm s16le */
  audio?: {
    format?: 'pcm' | 'wav'
    rate?: number
    bits?: number
    channel?: number
    [key: string]: unknown
  }
  user?: {
    uid?: string
    [key: string]: unknown
  }
}

/* ───────────────────────────────────────────────────────────
   session
   ─────────────────────────────────────────────────────────── */

type State = 'idle' | 'connecting' | 'ready' | 'streaming' | 'finishing' | 'closed' | 'error'

// 背压阈值 —— 弱网下 ws.send 会把未发出的帧堆进 socket buffer，几十秒就能涨到 MB 级。
// 256KB 是「wire 字节」量（ws.bufferedAmount 算的是 gzip / 帧头 / 控制帧打包后的字节），
// 不是 raw PCM；对应到上行音频大约是 250-300 个 gzip 压缩音频帧 / 约 10-12s 上行缓冲量
// （seed-codec 给音频帧默认压缩，单帧 raw 1280B 压完通常 800-1000B）。
// 超过即认为「上行已经撑不住」：此时丢新帧让 buffer 自然回落，比让旧帧积压更接近实时；
// ASR 的 partial 会在拥塞窗口内出现识别空洞，是有意的 graceful degradation。
const WS_BACKPRESSURE_THRESHOLD_BYTES = 256 * 1024

export interface DoubaoSessionMetrics {
  /** pushAudio 因 bufferedAmount 超阈值而丢弃的帧数 */
  dropCount: number
  /** 整个 session 期间观察到的 ws.bufferedAmount 最大值（用于事后调阈值） */
  maxBufferedAmount: number
}

// 标准的 EventEmitter typed-events 写法（interface + class 同名 declaration merging）
// 等价于 TypedEmitter<{...}>；ESLint 的 no-unsafe-declaration-merging 在此为误报。
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DoubaoSession {
  on(event: 'partial', listener: (text: string) => void): this
  on(event: 'final', listener: (text: string) => void): this
  on(event: 'error', listener: (err: ASRError) => void): this
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DoubaoSession extends EventEmitter {
  private state: State = 'idle'
  private ws: WebSocket | null = null
  private sequence = 0
  private readonly requestId: string
  private readonly connectId: string
  private finishResolve: (() => void) | null = null
  private finishReject: ((err: Error) => void) | null = null
  private firstResponseResolve: (() => void) | null = null
  private firstResponseReject: ((err: Error) => void) | null = null
  private retried = false
  // 仅 session 内部观察用；绝不在 info 级日志输出（避免间接泄漏识别活动节奏）。
  // cleanup 时若有非零信号一次性 emit 到 debug 日志 —— 详见 emitMetricsOnClose 注释，
  // 该 debug 通道与 #62 verbose toggle 是独立维度（metrics 非隐私文本）。
  private readonly metrics: DoubaoSessionMetrics = {
    dropCount: 0,
    maxBufferedAmount: 0,
  }

  constructor(private readonly config: DoubaoSessionConfig) {
    super()
    this.requestId = randomUUID()
    this.connectId = randomUUID()
  }

  getState(): State {
    return this.state
  }

  /** 仅测试与 debug 路径调用；不要在产品代码热路径上读 */
  getMetrics(): Readonly<DoubaoSessionMetrics> {
    return this.metrics
  }

  /* ───── public lifecycle ───── */

  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`DoubaoSession.start(): invalid state ${this.state}`)
    }
    await this.openWsAndHandshake()
  }

  pushAudio(chunk: Buffer): void {
    if (this.state !== 'ready' && this.state !== 'streaming') return
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    // 背压：ws.send 不阻塞、socket buffer 不会自动回压采集端，所以这里手动判断。
    // 超阈值 → 丢新帧（drop-newest）：sequence 不递增，对端不会感知到「跳号」；
    // 同时记 metrics 供事后排查。不 emit error —— 拥塞是短暂状态，不应中断会话。
    const buffered = this.ws.bufferedAmount
    if (buffered > this.metrics.maxBufferedAmount) {
      this.metrics.maxBufferedAmount = buffered
    }
    if (buffered > WS_BACKPRESSURE_THRESHOLD_BYTES) {
      this.metrics.dropCount += 1
      return
    }

    this.state = 'streaming'
    this.sequence += 1
    const frame = encodeAudioFrame({
      pcm: chunk,
      withSequence: true,
      sequenceNumber: this.sequence,
      isLast: false,
    })
    this.ws.send(frame)
  }

  async finish(): Promise<void> {
    // finish() 仅在 ready / streaming 态合法。其它态显式抛错让上层 catch 兜底，
    // 而非 silent return —— 后者会让 orchestrator 误以为会话正常结束、永等不来的
    // final 事件，HUD 永久卡 processing（#50）。
    //
    // 拆成两条不同的 error message：
    //   - 'session-not-streaming'：state 不在 ready/streaming（FSM 层错）
    //   - 'session-ws-closed'：state 合法但底层 ws 已断（IO 层错）
    // 上层 orchestrator 可根据 message 做不同 fallback：前者是 bug（不该调 finish），
    // 后者是网络情况（值得 retry 或提示用户）。
    if (this.state !== 'ready' && this.state !== 'streaming') {
      throw new Error(`session-not-streaming: cannot finish in state '${this.state}'`)
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('session-ws-closed: ws not open during finish')
    }
    this.state = 'finishing'
    this.sequence += 1
    const lastFrame = encodeAudioFrame({
      pcm: Buffer.alloc(0),
      withSequence: true,
      sequenceNumber: this.sequence,
      isLast: true,
    })
    this.ws.send(lastFrame)

    return new Promise((resolve, reject) => {
      this.finishResolve = resolve
      this.finishReject = reject
      // 5s 兜底：服务端若 hang，不无限等
      const timeout = setTimeout(() => {
        if (this.finishReject) {
          this.finishReject(new Error('finish() timeout: no final response within 5s'))
          this.emitError({ code: 'NETWORK', message: 'finish timeout', retryable: false })
          this.cleanup()
        }
      }, 5000)
      // wrappedResolve 在 timeout 注册之后才赋给 this.finishResolve；中间窗口里
      // resolve / reject 都未触发，Promise 还没 settle，所以「先 plain resolve、
      // 后又被 timeout 路径抢到」的竞争是不可能的。即便 wrap 完成之后服务端 final
      // 帧与 setTimeout 几乎同时到达，Promise 只接受第一次 settle —— 后 settle 的
      // 调用 silent no-op，clearTimeout 也是幂等的。零行为风险。
      const wrappedResolve = (): void => {
        clearTimeout(timeout)
        resolve()
      }
      this.finishResolve = wrappedResolve
    })
  }

  abort(): void {
    if (this.state === 'closed') return
    this.cleanup()
  }

  /* ───── internals ───── */

  private resolveEndpointUrl(): string {
    if (this.config.endpointOverride) return this.config.endpointOverride
    return Endpoint[this.config.endpointKey ?? DEFAULT_ENDPOINT_KEY]
  }

  private buildHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      [Header.ApiResourceId]: this.config.resourceId ?? DEFAULT_RESOURCE_ID,
      [Header.ApiRequestId]: this.requestId,
      [Header.ApiSequence]: '-1',
      [Header.ApiConnectId]: this.connectId,
    }
    if (this.config.auth.mode === 'new') {
      h[Header.ApiKey] = this.config.auth.apiKey
    } else {
      h[Header.ApiAppKey] = this.config.auth.appKey
      h[Header.ApiAccessKey] = this.config.auth.accessKey
    }
    return h
  }

  private async openWsAndHandshake(): Promise<void> {
    this.state = 'connecting'
    const url = this.resolveEndpointUrl()
    const headers = this.buildHeaders()

    try {
      await this.connect(url, headers)
      const firstResp = new Promise<void>((resolve, reject) => {
        this.firstResponseResolve = resolve
        this.firstResponseReject = reject
      })
      this.sendFullClientRequest()
      await Promise.race([
        firstResp,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('handshake timeout')), 3000),
        ),
      ])
      this.firstResponseResolve = null
      this.firstResponseReject = null
      this.state = 'ready'
    } catch (err) {
      // 如果 state 已经是 error，说明 handleIncoming 里已 emit 过具体 ASRError，
      // 这里不重复发；只在真正未处理过的 case（如 ws connect 失败 / handshake timeout）才补一发
      if (!this.retried && this.isRetryable(err) && (this.state as State) !== 'error') {
        this.retried = true
        await new Promise((r) => setTimeout(r, 500))
        return this.openWsAndHandshake()
      }
      if ((this.state as State) !== 'error') {
        const asrErr = this.toASRError(err)
        this.emitError(asrErr)
      }
      this.cleanup()
      throw err
    }
  }

  private connect(url: string, headers: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { headers, perMessageDeflate: false })
      this.ws = ws

      const onOpen = (): void => {
        cleanup()
        resolve()
      }
      const onError = (err: Error): void => {
        cleanup()
        reject(err)
      }
      const onClose = (code: number, reason: Buffer): void => {
        if (this.state === 'connecting') {
          cleanup()
          reject(new Error(`ws closed before open: code=${code} reason=${reason.toString()}`))
        }
      }
      const cleanup = (): void => {
        ws.off('open', onOpen)
        ws.off('error', onError)
        ws.off('close', onClose)
      }

      ws.on('open', onOpen)
      ws.on('error', onError)
      ws.on('close', onClose)

      ws.on('message', (data: RawData) => this.handleIncoming(data))
      ws.on('close', (code: number, reason: Buffer) => {
        console.info(
          `[doubao] ws closed · code=${code} reason="${reason.toString()}" state=${this.state} sent=${this.sequence}`,
        )
        this.handleClose()
      })
      ws.on('error', (err) => this.handleSocketError(err))
    })
  }

  private sendFullClientRequest(): void {
    if (!this.ws) return
    this.sequence += 1
    const payload = this.buildFullClientPayload()
    const frame = encodeControlFrame({
      messageType: MessageType.FULL_CLIENT_REQUEST,
      sequenceNumber: this.sequence,
      json: payload,
    })
    this.ws.send(frame)
  }

  private buildFullClientPayload(): Record<string, unknown> {
    return {
      user: this.config.user ?? { uid: 'whoosh-electron' },
      audio: {
        format: 'pcm',
        rate: 16000,
        bits: 16,
        channel: 1,
        ...(this.config.audio ?? {}),
      },
      request: {
        model_name: 'bigmodel',
        enable_itn: true,
        enable_punc: true,
        ...(this.config.request ?? {}),
      },
    }
  }

  private handleIncoming(data: RawData): void {
    let buf: Buffer
    if (Buffer.isBuffer(data)) buf = data
    else if (data instanceof ArrayBuffer) buf = Buffer.from(data)
    else if (Array.isArray(data)) buf = Buffer.concat(data)
    else return

    let frame
    try {
      frame = decodeFrame(buf)
    } catch (err) {
      this.emitError({ code: 'PROTOCOL', message: String(err), retryable: false })
      return
    }

    console.info(
      `[doubao] rx · type=0x${frame.header.messageType.toString(16)} flags=0b${frame.header.flags.toString(2).padStart(4, '0')} state=${this.state}`,
    )

    if (frame.header.messageType === MessageType.SERVER_ERROR_RESPONSE) {
      const serverCode = frame.errorCode ?? -1
      // Payload 文档里说是 JSON，实际服务端可能用 .error / .error_msg / .message 不同 key；
      // 都试一遍，都没有就把整个 payload stringify 作为 message 留下排查线索
      let message = `server error ${serverCode}`
      if (typeof frame.payload === 'object' && frame.payload !== null) {
        const p = frame.payload as Record<string, unknown>
        const candidate =
          (typeof p.message === 'string' && p.message) ||
          (typeof p.error === 'string' && p.error) ||
          (typeof p.error_msg === 'string' && p.error_msg) ||
          ''
        message = candidate || JSON.stringify(p)
      } else if (typeof frame.payload === 'string') {
        message = frame.payload
      }
      this.emitError({
        code: this.classifyErrorCode(serverCode),
        message,
        retryable: false,
        serverCode,
      })
      this.cleanup()
      return
    }

    if (frame.header.messageType !== MessageType.FULL_SERVER_RESPONSE) return

    // 首个 server response 视为 handshake ack，解锁 start() 的等待。
    // 其内容仍按下面分支统一处理（一般是 text='' 会被空 partial 过滤掉）。
    if (this.firstResponseResolve) {
      const r = this.firstResponseResolve
      this.firstResponseResolve = null
      r()
    }

    if (typeof frame.payload !== 'object' || frame.payload === null) return

    const payload = frame.payload as Record<string, unknown>
    const result = payload.result as Record<string, unknown> | undefined
    if (!result) return
    const text = typeof result.text === 'string' ? result.text : null
    if (text === null) return

    // 仅以 server 帧 flags 的 NEG bit 判定 final；不能用 client 端 state == 'finishing'，
    // 因为 finish() 发出 last 帧后服务端可能仍有未消费完的 partial 在路上。
    const isLast = (frame.header.flags & 0b0010) !== 0
    if (isLast) {
      this.emit('final', text)
      if (this.finishResolve) {
        const r = this.finishResolve
        this.finishResolve = null
        this.finishReject = null
        r()
      }
      this.cleanup()
    } else {
      // 空文本的 ack / keep-alive 不向上层散播 partial（避免 UI 闪烁）
      if (text === '') return
      this.emit('partial', text)
    }
  }

  private handleClose(): void {
    if (this.state === 'closed') return
    // streaming/finishing 中 ws 被对端关掉 → 本地无 final 帧可达，必须显式
    // emit 'error'，否则上层 SessionOrchestrator 仅靠 finish() 的 reject 兜底
    // 时机晚于 HUD 已切到 processing，容易表现为「卡在识别中」。
    if (this.state === 'finishing' && this.finishReject) {
      const rej = this.finishReject
      this.finishResolve = null
      this.finishReject = null
      rej(new Error('ws closed during finish'))
      this.emit('error', { code: 'NETWORK', message: 'ws closed during finish', retryable: true })
    } else if (this.state === 'streaming') {
      this.emit('error', {
        code: 'NETWORK',
        message: 'ws closed during streaming',
        retryable: true,
      })
    }
    this.state = 'closed'
  }

  private handleSocketError(err: Error): void {
    if (this.state === 'closed' || this.state === 'error') return
    this.emitError({ code: 'NETWORK', message: err.message, retryable: false })
    this.cleanup()
  }

  private emitError(err: ASRError): void {
    if (this.state === 'error') return
    this.state = 'error'
    this.emit('error', err)
    if (this.firstResponseReject) {
      const rej = this.firstResponseReject
      this.firstResponseResolve = null
      this.firstResponseReject = null
      rej(new Error(err.message))
    }
    if (this.finishReject) {
      const rej = this.finishReject
      this.finishResolve = null
      this.finishReject = null
      rej(new Error(err.message))
    }
  }

  private cleanup(): void {
    if (this.ws) {
      try {
        this.ws.removeAllListeners('message')
        this.ws.close()
      } catch {
        // 忽略 close 异常
      }
      this.ws = null
    }
    if ((this.state as State) !== 'error') this.state = 'closed'
    this.emitMetricsOnClose()
  }

  // 会话收尾时把背压观察值落到 debug 日志，方便事后判断阈值是否合理。
  // 仅 dropCount > 0 或 maxBufferedAmount 显著（>1 帧 ~3.2KB）才输出，避免噪音。
  //
  // 不接 #62 的 verbose toggle —— 该 toggle 的语义是「把识别文本（隐私敏感）写日志」，
  // 而 metrics 是结构化数值，没有隐私问题，留在 console.debug 即可：用户主动开 devtools
  // 才会看到，与 info 级别隔离。要单独切关 metrics 输出可以未来加 logging.metrics flag。
  private emitMetricsOnClose(): void {
    const { dropCount, maxBufferedAmount } = this.metrics
    if (dropCount === 0 && maxBufferedAmount < 4 * 1024) return
    console.debug(
      `[doubao] ws backpressure metrics · drop=${dropCount} maxBuffered=${maxBufferedAmount}B threshold=${WS_BACKPRESSURE_THRESHOLD_BYTES}B`,
    )
  }

  private isRetryable(err: unknown): boolean {
    if (!(err instanceof Error)) return false
    const msg = err.message.toLowerCase()
    // 鉴权失败（401/403）以及 4xx 客户端错误不重试
    if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) return false
    return true
  }

  private toASRError(err: unknown): ASRError {
    if (!(err instanceof Error)) {
      return { code: 'UNKNOWN', message: String(err), retryable: false }
    }
    const msg = err.message
    if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) {
      return { code: 'AUTH', message: msg, retryable: false }
    }
    return { code: 'NETWORK', message: msg, retryable: true }
  }

  private classifyErrorCode(serverCode: number): ASRErrorCode {
    // 豆包错误码 4xxxxxxx 系列：参数/鉴权 等客户端错
    // 55000031 服务过载
    // 详见文档「错误码」节
    if (serverCode === 55000031) return 'QUOTA'
    if (serverCode >= 45000000 && serverCode < 46000000) return 'PROTOCOL'
    return 'UNKNOWN'
  }
}
