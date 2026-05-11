// DoubaoProvider —— 实现 ASRProvider 接口
//
// 把 DoubaoSession（每次会话一次性使用）包装成可重复的 Provider 实例。
// 每次 start() 创建新的 session；finish()/abort() 后 session 释放。
//
// settingsSchema 描述了用户在 Settings 面板能改的字段：
//   - auth.mode（new/old）+ 对应 key/token 字段
//   - resourceId（4 个变体下拉）
//   - endpointKey（3 个 endpoint）
//   - language / enable_punc / enable_itn / enable_ddc / show_utterances

import { EventEmitter } from 'node:events'
import type {
  ASRCapabilities,
  ASRError,
  ASRProvider,
  ASRStartOptions,
} from '@shared/types/provider.js'
import { DEFAULT_ENDPOINT_KEY, DEFAULT_RESOURCE_ID, ResourceId } from './constants.js'
import { DoubaoSession, type DoubaoAuth, type DoubaoSessionConfig } from './session.js'

const DOUBAO_CAPABILITIES: ASRCapabilities = {
  streaming: true,
  partialResults: true,
}

export interface DoubaoProviderConfig {
  auth: DoubaoAuth
  resourceId?: string
  endpointKey?: DoubaoSessionConfig['endpointKey']
  endpointOverride?: string
  request?: DoubaoSessionConfig['request']
  audio?: DoubaoSessionConfig['audio']
  user?: DoubaoSessionConfig['user']
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DoubaoProvider {
  on(event: 'partial', listener: (text: string) => void): this
  on(event: 'final', listener: (text: string) => void): this
  on(event: 'error', listener: (err: ASRError) => void): this
  off(event: 'partial', listener: (text: string) => void): this
  off(event: 'final', listener: (text: string) => void): this
  off(event: 'error', listener: (err: ASRError) => void): this
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DoubaoProvider extends EventEmitter implements ASRProvider {
  readonly id = 'doubao'
  readonly capabilities = DOUBAO_CAPABILITIES
  readonly settingsSchema = DOUBAO_SETTINGS_SCHEMA
  readonly defaults = DOUBAO_DEFAULTS

  private session: DoubaoSession | null = null

  constructor(private readonly config: DoubaoProviderConfig) {
    super()
  }

  async start(_opts: ASRStartOptions): Promise<void> {
    if (this.session) {
      throw new Error('DoubaoProvider: session already in progress; call finish/abort first')
    }
    const session = new DoubaoSession({
      auth: this.config.auth,
      resourceId: this.config.resourceId ?? DEFAULT_RESOURCE_ID,
      endpointKey: this.config.endpointKey ?? DEFAULT_ENDPOINT_KEY,
      ...(this.config.endpointOverride !== undefined
        ? { endpointOverride: this.config.endpointOverride }
        : {}),
      ...(this.config.request !== undefined ? { request: this.config.request } : {}),
      ...(this.config.audio !== undefined ? { audio: this.config.audio } : {}),
      ...(this.config.user !== undefined ? { user: this.config.user } : {}),
    })
    session.on('partial', (text) => this.emit('partial', text))
    session.on('final', (text) => this.emit('final', text))
    session.on('error', (err) => this.emit('error', err))
    this.session = session
    await session.start()
  }

  pushAudio(chunk: Buffer): void {
    this.session?.pushAudio(chunk)
  }

  async finish(): Promise<void> {
    if (!this.session) return
    const s = this.session
    try {
      await s.finish()
    } finally {
      this.session = null
    }
  }

  abort(): void {
    this.session?.abort()
    this.session = null
  }
}

/* ───────────────────────────────────────────────────────────
   Settings schema —— Settings UI 据此 schema-driven 渲染
   ─────────────────────────────────────────────────────────── */

const DOUBAO_SETTINGS_SCHEMA = {
  type: 'object',
  required: ['auth', 'resourceId'],
  properties: {
    auth: {
      type: 'object',
      title: '鉴权',
      oneOf: [
        {
          title: '新版控制台（单 API Key）',
          required: ['mode', 'apiKey'],
          properties: {
            mode: { const: 'new' },
            apiKey: { type: 'string', title: 'X-Api-Key' },
          },
        },
        {
          title: '旧版控制台（App Key + Access Key）',
          required: ['mode', 'appKey', 'accessKey'],
          properties: {
            mode: { const: 'old' },
            appKey: { type: 'string', title: 'X-Api-App-Key' },
            accessKey: { type: 'string', title: 'X-Api-Access-Key' },
          },
        },
      ],
    },
    resourceId: {
      type: 'string',
      title: 'Resource ID',
      enum: [
        ResourceId.v2_duration,
        ResourceId.v2_concurrent,
        ResourceId.v1_duration,
        ResourceId.v1_concurrent,
      ],
      default: ResourceId.v2_duration,
    },
    endpointKey: {
      type: 'string',
      title: 'Endpoint',
      enum: ['bigmodel_async', 'bigmodel', 'bigmodel_nostream'],
      default: 'bigmodel_async',
    },
    request: {
      type: 'object',
      title: '识别参数',
      properties: {
        language: { type: 'string', title: '识别语言', default: 'zh-CN' },
        enable_punc: { type: 'boolean', title: '自动标点', default: true },
        enable_itn: { type: 'boolean', title: '文本逆归一化 (ITN)', default: true },
        enable_ddc: { type: 'boolean', title: '语义顺滑', default: false },
        show_utterances: { type: 'boolean', title: '输出分句信息', default: false },
      },
    },
  },
} as const

const DOUBAO_DEFAULTS = {
  resourceId: ResourceId.v2_duration,
  endpointKey: DEFAULT_ENDPOINT_KEY,
  request: {
    language: 'zh-CN',
    enable_punc: true,
    enable_itn: true,
    enable_ddc: false,
    show_utterances: false,
    model_name: 'bigmodel',
  },
  audio: {
    format: 'pcm',
    rate: 16000,
    bits: 16,
    channel: 1,
  },
} as const
