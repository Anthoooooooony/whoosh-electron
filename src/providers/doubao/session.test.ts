// DoubaoSession 单元测试 —— 聚焦状态机的边界行为，特别是 finish() 在非
// streaming 态下必须显式抛错（issue #50）。
//
// 对 wire-level 行为（headers / FULL_CLIENT_REQUEST payload / 音频字节）的覆盖
// 已经在 provider.test.ts，这里不再重复。

import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket as WSServerSocket } from 'ws'
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
