// DoubaoProvider 集成测试 —— 用本地 ws-mock 模拟豆包服务端，
// 验证 codec / session / provider 全链路在 wire-level 上工作正确。
//
// 覆盖：
//   - 握手 headers（new vs old auth mode）
//   - 客户端发的 FULL_CLIENT_REQUEST 经服务端解码后能拿到原 JSON config
//   - 客户端音频帧解码后 PCM 字节一致
//   - 服务端推 partial → provider 'partial' 事件
//   - 服务端推 final（NEG flag）→ provider 'final' 事件，finish() resolve
//   - 服务端推 SERVER_ERROR → provider 'error' 事件，state 进 closed

import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { WebSocketServer, type WebSocket as WSServerSocket } from 'ws'
import {
  Compression,
  DEFAULT_HEADER_SIZE,
  Flags,
  MessageType,
  PROTOCOL_VERSION,
  Serialization,
} from './constants.js'
import { decodeFrame, encodeControlFrame } from './seed-codec.js'
import { DoubaoProvider } from './index.js'
import type { ASRError } from '@shared/types/provider.js'

interface CapturedHeaders {
  headers: Record<string, string | string[] | undefined>
}

async function startMockServer(): Promise<{
  server: WebSocketServer
  url: string
  captured: CapturedHeaders
  close: () => Promise<void>
}> {
  const captured: CapturedHeaders = { headers: {} }
  const server = new WebSocketServer({ port: 0 })
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const port = (server.address() as AddressInfo).port
  server.on('connection', (_ws: WSServerSocket, req: IncomingMessage) => {
    captured.headers = req.headers
  })
  return {
    server,
    url: `ws://127.0.0.1:${port}`,
    captured,
    close: () =>
      new Promise<void>((resolve, reject) => {
        // 强制断掉所有客户端，避免单测失败留下 dangling connection 导致 afterEach 超时
        for (const client of server.clients) client.terminate()
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}

/** 模拟服务端：解码客户端帧，按 step-by-step 脚本回响应 */
function attachScriptedHandler(
  server: WebSocketServer,
  script: {
    onFullClientRequest?: (json: unknown) => Buffer[] // 多个响应帧（一般是 1 个 ack）
    onAudio?: (pcm: Buffer, isLast: boolean) => Buffer[]
  },
): void {
  server.on('connection', (ws: WSServerSocket) => {
    ws.on('message', (data) => {
      const buf = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer)
      const frame = decodeFrame(buf)
      let replies: Buffer[] = []
      if (frame.header.messageType === MessageType.FULL_CLIENT_REQUEST) {
        replies = script.onFullClientRequest?.(frame.payload) ?? []
      } else if (frame.header.messageType === MessageType.AUDIO_ONLY_REQUEST) {
        const isLast = (frame.header.flags & 0b0010) !== 0
        const pcm = frame.payload instanceof Buffer ? frame.payload : Buffer.alloc(0)
        replies = script.onAudio?.(pcm, isLast) ?? []
      }
      for (const r of replies) ws.send(r)
    })
  })
}

/** 构造服务端 FULL_SERVER_RESPONSE 帧（带 sequence + JSON + GZIP） */
function buildServerResponse(
  text: string,
  opts: { sequence: number; isLast?: boolean } = { sequence: 1 },
): Buffer {
  return encodeControlFrame({
    messageType: MessageType.FULL_SERVER_RESPONSE,
    flags: opts.isLast ? Flags.NEG_WITH_SEQUENCE : Flags.POS_SEQUENCE,
    sequenceNumber: opts.sequence,
    json: { result: { text } },
  })
}

/** 构造服务端 SERVER_ERROR_RESPONSE 帧 */
function buildServerError(code: number, message: string): Buffer {
  const headerBuf = Buffer.alloc(4)
  headerBuf[0] = (PROTOCOL_VERSION << 4) | DEFAULT_HEADER_SIZE
  headerBuf[1] = (MessageType.SERVER_ERROR_RESPONSE << 4) | Flags.NO_SEQUENCE
  headerBuf[2] = (Serialization.JSON << 4) | Compression.NONE
  headerBuf[3] = 0
  const codeBuf = Buffer.alloc(4)
  codeBuf.writeUInt32BE(code, 0)
  const payload = Buffer.from(JSON.stringify({ code, message }), 'utf8')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(payload.length, 0)
  return Buffer.concat([headerBuf, codeBuf, lenBuf, payload])
}

describe('DoubaoProvider with mock server', () => {
  let mock: Awaited<ReturnType<typeof startMockServer>>

  beforeEach(async () => {
    mock = await startMockServer()
  })

  afterEach(async () => {
    await mock.close()
  })

  it('new-mode auth: sends X-Api-Key header on upgrade', async () => {
    attachScriptedHandler(mock.server, {
      onFullClientRequest: () => [buildServerResponse('', { sequence: 1 })],
      onAudio: (_, isLast) =>
        isLast ? [buildServerResponse('done', { sequence: 99, isLast: true })] : [],
    })

    const provider = new DoubaoProvider({
      auth: { mode: 'new', apiKey: 'test-key-uuid' },
      endpointOverride: mock.url,
    })
    await provider.start({ sampleRate: 16000, encoding: 'pcm_s16le' })

    expect(mock.captured.headers['x-api-key']).toBe('test-key-uuid')
    expect(mock.captured.headers['x-api-resource-id']).toBe('volc.seedasr.sauc.duration')
    expect(mock.captured.headers['x-api-sequence']).toBe('-1')
    expect(mock.captured.headers['x-api-request-id']).toMatch(/^[0-9a-f-]{36}$/i)
    expect(mock.captured.headers['x-api-app-key']).toBeUndefined()

    provider.abort()
  })

  it('old-mode auth: sends X-Api-App-Key + X-Api-Access-Key, no X-Api-Key', async () => {
    attachScriptedHandler(mock.server, {
      onFullClientRequest: () => [buildServerResponse('', { sequence: 1 })],
      onAudio: () => [],
    })

    const provider = new DoubaoProvider({
      auth: { mode: 'old', appKey: '123456789', accessKey: 'token-xxx' },
      endpointOverride: mock.url,
      resourceId: 'volc.bigasr.sauc.duration',
    })
    await provider.start({ sampleRate: 16000, encoding: 'pcm_s16le' })

    expect(mock.captured.headers['x-api-app-key']).toBe('123456789')
    expect(mock.captured.headers['x-api-access-key']).toBe('token-xxx')
    expect(mock.captured.headers['x-api-resource-id']).toBe('volc.bigasr.sauc.duration')
    expect(mock.captured.headers['x-api-key']).toBeUndefined()

    provider.abort()
  })

  it('full client request payload contains user/audio/request', async () => {
    let receivedJson: unknown
    attachScriptedHandler(mock.server, {
      onFullClientRequest: (json) => {
        receivedJson = json
        return [buildServerResponse('', { sequence: 1 })]
      },
      onAudio: () => [],
    })

    const provider = new DoubaoProvider({
      auth: { mode: 'new', apiKey: 'k' },
      endpointOverride: mock.url,
      request: { language: 'zh-CN', enable_punc: true },
      user: { uid: 'tester' },
    })
    await provider.start({ sampleRate: 16000, encoding: 'pcm_s16le' })

    expect(receivedJson).toMatchObject({
      user: { uid: 'tester' },
      audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
      request: { model_name: 'bigmodel', language: 'zh-CN', enable_punc: true },
    })
    provider.abort()
  })

  it('audio chunks preserve PCM bytes byte-for-byte', async () => {
    const receivedChunks: Buffer[] = []
    attachScriptedHandler(mock.server, {
      onFullClientRequest: () => [buildServerResponse('', { sequence: 1 })],
      onAudio: (pcm, isLast) => {
        if (!isLast) receivedChunks.push(pcm)
        return isLast ? [buildServerResponse('', { sequence: 99, isLast: true })] : []
      },
    })

    const provider = new DoubaoProvider({
      auth: { mode: 'new', apiKey: 'k' },
      endpointOverride: mock.url,
    })
    await provider.start({ sampleRate: 16000, encoding: 'pcm_s16le' })

    const chunkA = Buffer.alloc(1280)
    for (let i = 0; i < chunkA.length; i++) chunkA[i] = (i * 7) % 256
    const chunkB = Buffer.alloc(1280)
    for (let i = 0; i < chunkB.length; i++) chunkB[i] = (i * 13) % 256
    provider.pushAudio(chunkA)
    provider.pushAudio(chunkB)
    await provider.finish()

    expect(receivedChunks).toHaveLength(2)
    expect(receivedChunks[0]).toEqual(chunkA)
    expect(receivedChunks[1]).toEqual(chunkB)
  })

  it('emits partial events during streaming, final on last response', async () => {
    let audioCount = 0
    attachScriptedHandler(mock.server, {
      onFullClientRequest: () => [buildServerResponse('', { sequence: 1 })],
      onAudio: (_, isLast) => {
        audioCount++
        if (isLast) return [buildServerResponse('你好世界。', { sequence: 99, isLast: true })]
        return [buildServerResponse(`你好${'·'.repeat(audioCount)}`, { sequence: audioCount + 1 })]
      },
    })

    const provider = new DoubaoProvider({
      auth: { mode: 'new', apiKey: 'k' },
      endpointOverride: mock.url,
    })

    const partials: string[] = []
    let finalText: string | null = null
    provider.on('partial', (t) => partials.push(t))
    provider.on('final', (t) => {
      finalText = t
    })

    await provider.start({ sampleRate: 16000, encoding: 'pcm_s16le' })
    provider.pushAudio(Buffer.alloc(1280))
    provider.pushAudio(Buffer.alloc(1280))
    await provider.finish()

    expect(partials).toEqual(['你好·', '你好··'])
    expect(finalText).toBe('你好世界。')
  })

  it('emits error event on SERVER_ERROR frame during handshake', async () => {
    attachScriptedHandler(mock.server, {
      onFullClientRequest: () => [buildServerError(55000031, '服务过载')],
    })

    const provider = new DoubaoProvider({
      auth: { mode: 'new', apiKey: 'k' },
      endpointOverride: mock.url,
    })
    const errSpy = vi.fn<(err: ASRError) => void>()
    provider.on('error', errSpy)

    // 握手期间收到 SERVER_ERROR 应当：emit 'error' + 拒绝 start() Promise
    await expect(provider.start({ sampleRate: 16000, encoding: 'pcm_s16le' })).rejects.toThrow(
      /服务过载/,
    )

    expect(errSpy).toHaveBeenCalledOnce()
    const err = errSpy.mock.calls[0]![0]
    expect(err.code).toBe('QUOTA')
    expect(err.serverCode).toBe(55000031)
    expect(err.message).toBe('服务过载')
  })
})
