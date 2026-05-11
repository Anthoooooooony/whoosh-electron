import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  Compression,
  DEFAULT_HEADER_SIZE,
  Flags,
  MessageType,
  PROTOCOL_VERSION,
  Serialization,
  flagsHasSequence,
  flagsIsLast,
} from './constants.js'
import { decodeFrame, encodeAudioFrame, encodeControlFrame } from './seed-codec.js'

describe('flagsHasSequence / flagsIsLast', () => {
  it.each([
    [Flags.NO_SEQUENCE, false, false],
    [Flags.POS_SEQUENCE, true, false],
    [Flags.NEG_SEQUENCE, false, true],
    [Flags.NEG_WITH_SEQUENCE, true, true],
  ] as const)('flags 0b%s', (flags, hasSeq, isLast) => {
    expect(flagsHasSequence(flags)).toBe(hasSeq)
    expect(flagsIsLast(flags)).toBe(isLast)
  })
})

describe('encodeControlFrame', () => {
  it('writes 4-byte header with correct nibble layout', () => {
    const buf = encodeControlFrame({
      messageType: MessageType.FULL_CLIENT_REQUEST,
      sequenceNumber: 1,
      json: { hello: 'world' },
    })
    // byte 0: protocol_version<<4 | header_size
    expect(buf[0]).toBe((PROTOCOL_VERSION << 4) | DEFAULT_HEADER_SIZE)
    // byte 1: msg_type<<4 | flags
    expect(buf[1]).toBe((MessageType.FULL_CLIENT_REQUEST << 4) | Flags.POS_SEQUENCE)
    // byte 2: serialization<<4 | compression
    expect(buf[2]).toBe((Serialization.JSON << 4) | Compression.GZIP)
    expect(buf[3]).toBe(0)
  })

  it('includes sequence number (4-byte BE) when flags has sequence bit', () => {
    const buf = encodeControlFrame({
      messageType: MessageType.FULL_CLIENT_REQUEST,
      sequenceNumber: 0x01020304,
      json: { x: 1 },
    })
    expect(buf.readUInt32BE(4)).toBe(0x01020304)
  })

  it('omits sequence number when flags = NO_SEQUENCE', () => {
    const buf = encodeControlFrame({
      messageType: MessageType.FULL_CLIENT_REQUEST,
      flags: Flags.NO_SEQUENCE,
      json: { x: 1 },
    })
    // header(4) + len(4) + gzipped payload — so payloadLen at offset 4
    expect(buf.length).toBeGreaterThan(8)
    // 直接 decode 验证
    const frame = decodeFrame(buf)
    expect(frame.sequenceNumber).toBeUndefined()
    expect(frame.payload).toEqual({ x: 1 })
  })

  it('throws when flags has sequence but sequenceNumber not provided', () => {
    expect(() =>
      encodeControlFrame({
        messageType: MessageType.FULL_CLIENT_REQUEST,
        json: { x: 1 },
      } as Parameters<typeof encodeControlFrame>[0]),
    ).toThrow(/sequenceNumber required/)
  })

  it('actually gzip-compresses JSON payload', () => {
    const buf = encodeControlFrame({
      messageType: MessageType.FULL_CLIENT_REQUEST,
      sequenceNumber: 1,
      json: { hello: 'world'.repeat(100) }, // 让 gzip 有压缩空间
    })
    const len = buf.readUInt32BE(8)
    const payload = buf.subarray(12, 12 + len)
    // gzip magic bytes: 1f 8b
    expect(payload[0]).toBe(0x1f)
    expect(payload[1]).toBe(0x8b)
  })

  it('honors compression=NONE', () => {
    const buf = encodeControlFrame({
      messageType: MessageType.FULL_CLIENT_REQUEST,
      sequenceNumber: 1,
      compression: Compression.NONE,
      json: { x: 1 },
    })
    expect(buf[2]).toBe((Serialization.JSON << 4) | Compression.NONE)
    const len = buf.readUInt32BE(8)
    const payload = buf.subarray(12, 12 + len)
    expect(payload.toString('utf8')).toBe('{"x":1}')
  })
})

describe('encodeAudioFrame', () => {
  it('uses AUDIO_ONLY_REQUEST + Serialization=NONE', () => {
    const pcm = Buffer.alloc(640 * 2) // 一帧 16k mono s16le 40ms
    const buf = encodeAudioFrame({
      pcm,
      sequenceNumber: 2,
    })
    expect((buf[1]! >> 4) & 0xf).toBe(MessageType.AUDIO_ONLY_REQUEST)
    expect((buf[2]! >> 4) & 0xf).toBe(Serialization.NONE)
    expect(buf[2]! & 0xf).toBe(Compression.GZIP)
  })

  it('flags derives from (withSequence, isLast) combination', () => {
    const pcm = Buffer.from([1, 2, 3])

    const cases = [
      { withSequence: true, isLast: false, expected: Flags.POS_SEQUENCE, seq: 1 },
      { withSequence: true, isLast: true, expected: Flags.NEG_WITH_SEQUENCE, seq: 1 },
      { withSequence: false, isLast: false, expected: Flags.NO_SEQUENCE, seq: undefined },
      { withSequence: false, isLast: true, expected: Flags.NEG_SEQUENCE, seq: undefined },
    ] as const

    for (const c of cases) {
      const buf = encodeAudioFrame({
        pcm,
        withSequence: c.withSequence,
        isLast: c.isLast,
        ...(c.seq !== undefined ? { sequenceNumber: c.seq } : {}),
      })
      expect(buf[1]! & 0xf).toBe(c.expected)
    }
  })

  it('throws when withSequence but sequenceNumber missing', () => {
    expect(() => encodeAudioFrame({ pcm: Buffer.alloc(0), withSequence: true })).toThrow(
      /sequenceNumber required/,
    )
  })

  it('accepts Uint8Array for pcm', () => {
    const u8 = new Uint8Array([0xab, 0xcd])
    const buf = encodeAudioFrame({ pcm: u8, sequenceNumber: 1 })
    const frame = decodeFrame(buf)
    expect(frame.payload).toBeInstanceOf(Buffer)
    expect(frame.payload).toEqual(Buffer.from([0xab, 0xcd]))
  })
})

describe('decodeFrame roundtrip', () => {
  it('FULL_CLIENT_REQUEST roundtrip preserves JSON', () => {
    const json = {
      user: { uid: 'whoosh-user' },
      audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
      request: { model_name: 'bigmodel', language: 'zh-CN', enable_punc: true },
    }
    const buf = encodeControlFrame({
      messageType: MessageType.FULL_CLIENT_REQUEST,
      sequenceNumber: 1,
      json,
    })
    const frame = decodeFrame(buf)
    expect(frame.header.messageType).toBe(MessageType.FULL_CLIENT_REQUEST)
    expect(frame.header.flags).toBe(Flags.POS_SEQUENCE)
    expect(frame.sequenceNumber).toBe(1)
    expect(frame.payload).toEqual(json)
  })

  it('AUDIO_ONLY_REQUEST roundtrip preserves PCM bytes', () => {
    const pcm = Buffer.alloc(1280)
    for (let i = 0; i < pcm.length; i++) pcm[i] = i % 256
    const buf = encodeAudioFrame({ pcm, sequenceNumber: 5 })
    const frame = decodeFrame(buf)
    expect(frame.header.messageType).toBe(MessageType.AUDIO_ONLY_REQUEST)
    expect(frame.sequenceNumber).toBe(5)
    expect(frame.payload).toBeInstanceOf(Buffer)
    expect(frame.payload).toEqual(pcm)
  })

  it('last audio frame (NEG_WITH_SEQUENCE) negates sequence on wire', () => {
    // 协议要求 NEG_WITH_SEQUENCE 的 sequence 在 wire 上为负数；
    // caller 传 99，wire 写入 -99，decoder 也读回 -99（两补码 int32）
    const pcm = Buffer.from([1, 2, 3, 4])
    const buf = encodeAudioFrame({ pcm, sequenceNumber: 99, isLast: true })
    // 直接核验 wire 字节：跳过 4 字节 header，紧跟 4 字节 sequence
    expect(buf.readInt32BE(4)).toBe(-99)
    const frame = decodeFrame(buf)
    expect(frame.header.flags).toBe(Flags.NEG_WITH_SEQUENCE)
    expect(frame.sequenceNumber).toBe(-99)
    expect(flagsIsLast(frame.header.flags)).toBe(true)
  })

  it('decodes mock SERVER_ERROR (header + errorCode + len + payload)', () => {
    // 手动构造一个 SERVER_ERROR 帧
    const errorJson = { code: 1001, message: 'invalid token' }
    const errorPayload = gzipSync(Buffer.from(JSON.stringify(errorJson), 'utf8'))
    const header = Buffer.alloc(4)
    header[0] = (PROTOCOL_VERSION << 4) | DEFAULT_HEADER_SIZE
    header[1] = (MessageType.SERVER_ERROR_RESPONSE << 4) | Flags.NO_SEQUENCE
    header[2] = (Serialization.JSON << 4) | Compression.GZIP
    header[3] = 0
    const codeBuf = Buffer.alloc(4)
    codeBuf.writeUInt32BE(40100001, 0)
    const lenBuf = Buffer.alloc(4)
    lenBuf.writeUInt32BE(errorPayload.length, 0)
    const frame = decodeFrame(Buffer.concat([header, codeBuf, lenBuf, errorPayload]))

    expect(frame.header.messageType).toBe(MessageType.SERVER_ERROR_RESPONSE)
    expect(frame.errorCode).toBe(40100001)
    expect(frame.sequenceNumber).toBeUndefined()
    expect(frame.payload).toEqual(errorJson)
  })

  it('throws on truncated buffer', () => {
    const full = encodeControlFrame({
      messageType: MessageType.FULL_CLIENT_REQUEST,
      sequenceNumber: 1,
      json: { x: 1 },
    })
    // 砍掉最后几个 payload 字节
    expect(() => decodeFrame(full.subarray(0, full.length - 5))).toThrow(/truncated/)
  })

  it('throws on unknown header_size', () => {
    const bad = Buffer.from([
      (PROTOCOL_VERSION << 4) | 0x2, // header_size = 2 (= 8 bytes，未实现)
      (MessageType.FULL_CLIENT_REQUEST << 4) | Flags.NO_SEQUENCE,
      (Serialization.JSON << 4) | Compression.NONE,
      0,
      0,
      0,
      0,
      0,
    ])
    expect(() => decodeFrame(bad)).toThrow(/unsupported header_size/)
  })
})
