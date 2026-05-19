// DoubaoSession 单元测试 —— 聚焦状态机的边界行为，特别是 finish() 在非
// streaming 态下必须显式抛错（issue #50）。
//
// 对 wire-level 行为（headers / FULL_CLIENT_REQUEST payload / 音频字节）的覆盖
// 已经在 provider.test.ts，这里不再重复。

import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket, { WebSocketServer, type WebSocket as WSServerSocket } from 'ws'
import { Flags, MessageType } from './constants.js'
import { decodeFrame, encodeControlFrame } from './seed-codec.js'
import { DoubaoSession } from './session.js'

async function startMockServer(): Promise<{
  server: WebSocketServer
  url: string
  close: () => Promise<void>
}> {
  const server = new WebSocketServer({ port: 0 })
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const port = (server.address() as AddressInfo).port
  return {
    server,
    url: `ws://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const client of server.clients) client.terminate()
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}

/** 用最小脚本回握手 ack，让 session 进入 'ready' 态 */
function attachHandshakeAck(server: WebSocketServer): void {
  server.on('connection', (ws: WSServerSocket) => {
    ws.on('message', (data) => {
      const buf = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer)
      const frame = decodeFrame(buf)
      if (frame.header.messageType === MessageType.FULL_CLIENT_REQUEST) {
        ws.send(
          encodeControlFrame({
            messageType: MessageType.FULL_SERVER_RESPONSE,
            flags: Flags.POS_SEQUENCE,
            sequenceNumber: 1,
            json: { result: { text: '' } },
          }),
        )
      }
    })
  })
}

describe('DoubaoSession.finish() 状态守卫', () => {
  let mock: Awaited<ReturnType<typeof startMockServer>>

  beforeEach(async () => {
    mock = await startMockServer()
  })

  afterEach(async () => {
    await mock.close()
  })

  it('idle 态调用 finish() 立即抛错（从未 start）', async () => {
    const session = new DoubaoSession({
      auth: { mode: 'new', apiKey: 'k' },
      endpointOverride: mock.url,
    })
    await expect(session.finish()).rejects.toThrow(/session-not-streaming/)
    expect(session.getState()).toBe('idle')
  })

  // issue #50 的核心场景：ws 在 streaming 期间被对端关闭，session 状态被
  // handleClose 翻成 'closed'；orchestrator 随后调用 finish() 必须抛错，
  // 而非 silent return —— 否则 HUD 永远卡 processing。
  it('streaming 期间 ws 被对端关闭后，finish() 抛 session-not-streaming', async () => {
    attachHandshakeAck(mock.server)

    const session = new DoubaoSession({
      auth: { mode: 'new', apiKey: 'k' },
      endpointOverride: mock.url,
    })
    await session.start()
    session.pushAudio(Buffer.alloc(1280))
    expect(session.getState()).toBe('streaming')

    // 等待 handleClose 把 state 翻成 'closed'
    const closed = new Promise<void>((resolve) => {
      session.once('error', () => resolve())
    })
    for (const client of mock.server.clients) client.terminate()
    await closed
    expect(session.getState()).toBe('closed')

    await expect(session.finish()).rejects.toThrow(/session-not-streaming/)
  })

  it('finish() 后再次 finish() 抛错（状态已是 closed）', async () => {
    attachHandshakeAck(mock.server)
    // 让服务端在收到 last 帧后回一帧 final，使第一次 finish() 正常 resolve
    mock.server.on('connection', (ws: WSServerSocket) => {
      ws.on('message', (data) => {
        const buf = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer)
        const frame = decodeFrame(buf)
        if (frame.header.messageType === MessageType.AUDIO_ONLY_REQUEST) {
          const isLast = (frame.header.flags & 0b0010) !== 0
          if (isLast) {
            ws.send(
              encodeControlFrame({
                messageType: MessageType.FULL_SERVER_RESPONSE,
                flags: Flags.NEG_WITH_SEQUENCE,
                sequenceNumber: 99,
                json: { result: { text: '你好' } },
              }),
            )
          }
        }
      })
    })

    const session = new DoubaoSession({
      auth: { mode: 'new', apiKey: 'k' },
      endpointOverride: mock.url,
    })
    await session.start()
    session.pushAudio(Buffer.alloc(1280))
    await session.finish()
    expect(session.getState()).toBe('closed')

    await expect(session.finish()).rejects.toThrow(/session-not-streaming/)
  })
})

// issue #61 —— 弱网下 ws.send 会把帧堆进 socket buffer，几十秒就能涨到 MB 级。
// pushAudio 必须在 bufferedAmount 超阈值时丢新帧（drop-newest），并把丢弃量、
// 历史最大 bufferedAmount 记到 session 内部 metrics，cleanup 时一次性 emit。
describe('DoubaoSession.pushAudio() 背压', () => {
  let mock: Awaited<ReturnType<typeof startMockServer>>

  beforeEach(async () => {
    mock = await startMockServer()
  })

  afterEach(async () => {
    await mock.close()
  })

  // 直接操纵 session 内部的 ws 实例（强转为可写句柄），覆盖 bufferedAmount 为
  // 受测试控制的值。比启动一个慢速 mock server 更可控、不依赖时序。
  function stubBufferedAmount(ws: WebSocket, value: number): void {
    Object.defineProperty(ws, 'bufferedAmount', {
      configurable: true,
      get: () => value,
    })
  }

  it('bufferedAmount 超阈值时不调 send 且 dropCount 自增', async () => {
    attachHandshakeAck(mock.server)
    const session = new DoubaoSession({
      auth: { mode: 'new', apiKey: 'k' },
      endpointOverride: mock.url,
    })
    await session.start()

    // 从 session 拿到内部 ws；TypeScript 上私有，但运行时可访问
    const ws = (session as unknown as { ws: WebSocket }).ws
    expect(ws).toBeTruthy()

    let sendCalls = 0
    const originalSend = ws.send.bind(ws)
    ws.send = ((...args: Parameters<WebSocket['send']>) => {
      sendCalls += 1
      return originalSend(...args)
    }) as typeof ws.send

    // 256KB + 1 字节 → 超 WS_BACKPRESSURE_THRESHOLD_BYTES (256*1024)
    stubBufferedAmount(ws, 256 * 1024 + 1)

    session.pushAudio(Buffer.alloc(1280))
    session.pushAudio(Buffer.alloc(1280))
    session.pushAudio(Buffer.alloc(1280))

    expect(sendCalls).toBe(0)
    expect(session.getMetrics().dropCount).toBe(3)
    expect(session.getMetrics().maxBufferedAmount).toBe(256 * 1024 + 1)
    // 丢帧不应推进状态：从未真正 send 过音频帧，session 还在 ready
    expect(session.getState()).toBe('ready')

    session.abort()
  })

  it('bufferedAmount 回落到阈值下后，后续 frame 正常 send', async () => {
    attachHandshakeAck(mock.server)
    const session = new DoubaoSession({
      auth: { mode: 'new', apiKey: 'k' },
      endpointOverride: mock.url,
    })
    await session.start()

    const ws = (session as unknown as { ws: WebSocket }).ws
    expect(ws).toBeTruthy()

    let sendCalls = 0
    const originalSend = ws.send.bind(ws)
    ws.send = ((...args: Parameters<WebSocket['send']>) => {
      sendCalls += 1
      return originalSend(...args)
    }) as typeof ws.send

    // 第一帧拥塞 → 丢
    stubBufferedAmount(ws, 300 * 1024)
    session.pushAudio(Buffer.alloc(1280))
    expect(sendCalls).toBe(0)
    expect(session.getMetrics().dropCount).toBe(1)

    // bufferedAmount 回落 → 正常 send
    stubBufferedAmount(ws, 8 * 1024)
    session.pushAudio(Buffer.alloc(1280))
    session.pushAudio(Buffer.alloc(1280))
    expect(sendCalls).toBe(2)
    expect(session.getMetrics().dropCount).toBe(1)
    expect(session.getState()).toBe('streaming')
    // maxBufferedAmount 保留拥塞期间观察到的峰值
    expect(session.getMetrics().maxBufferedAmount).toBe(300 * 1024)

    session.abort()
  })
})
