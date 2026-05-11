// 豆包 Seed 协议 encode / decode —— 纯函数，可独立测试，不依赖 Electron 或 WebSocket。
//
// 帧 layout 见 constants.ts。这个模块只负责字节级 codec；
// session 状态机（StartConnection / StartSession / FinishSession 等控制流）
// 在 session.ts 落地。

import { gunzipSync, gzipSync } from 'node:zlib'
import {
  Compression,
  DEFAULT_HEADER_SIZE,
  Flags,
  MessageType,
  PROTOCOL_VERSION,
  Serialization,
  flagsHasSequence,
  type CompressionValue,
  type FlagsValue,
  type MessageTypeValue,
  type SerializationValue,
} from './constants.js'

/* ───────────────────────────────────────────────────────────
   types
   ─────────────────────────────────────────────────────────── */

export interface SeedHeader {
  protocolVersion: number
  /** 单位 DWORD（4 字节）。固定为 1 → 4 字节 header */
  headerSize: number
  messageType: MessageTypeValue | number
  flags: FlagsValue | number
  serialization: SerializationValue | number
  compression: CompressionValue | number
  reserved: number
}

export interface SeedFrame {
  header: SeedHeader
  /** 仅当 flagsHasSequence(header.flags) === true 时存在 */
  sequenceNumber?: number
  /** 解压并解序列化后的"逻辑 payload"；JSON 帧是 object，audio/原始帧是 Buffer */
  payload: Buffer | Record<string, unknown> | string
  /** SERVER_ERROR 帧才有，从 header 后紧跟的 4 字节 BE int 取 */
  errorCode?: number
}

/* ───────────────────────────────────────────────────────────
   helpers
   ─────────────────────────────────────────────────────────── */

function packHeader(h: SeedHeader): Buffer {
  const buf = Buffer.alloc(4)
  buf[0] = ((h.protocolVersion & 0xf) << 4) | (h.headerSize & 0xf)
  buf[1] = ((h.messageType & 0xf) << 4) | (h.flags & 0xf)
  buf[2] = ((h.serialization & 0xf) << 4) | (h.compression & 0xf)
  buf[3] = h.reserved & 0xff
  return buf
}

function unpackHeader(buf: Buffer): SeedHeader {
  if (buf.length < 4) throw new Error('SeedFrame too short: header < 4 bytes')
  const b0 = buf[0] ?? 0
  const b1 = buf[1] ?? 0
  const b2 = buf[2] ?? 0
  const b3 = buf[3] ?? 0
  return {
    protocolVersion: (b0 >> 4) & 0xf,
    headerSize: b0 & 0xf,
    messageType: (b1 >> 4) & 0xf,
    flags: b1 & 0xf,
    serialization: (b2 >> 4) & 0xf,
    compression: b2 & 0xf,
    reserved: b3,
  }
}

function readUInt32BE(buf: Buffer, offset: number): number {
  if (buf.length < offset + 4) {
    throw new Error(`SeedFrame truncated: need 4 bytes at offset ${offset}`)
  }
  return buf.readUInt32BE(offset)
}

function writeUInt32BE(n: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32BE(n >>> 0, 0)
  return buf
}

function maybeCompress(payload: Buffer, compression: number): Buffer {
  if (compression === Compression.GZIP) return gzipSync(payload)
  return payload
}

function maybeDecompress(payload: Buffer, compression: number): Buffer {
  if (compression === Compression.GZIP) return gunzipSync(payload)
  return payload
}

function maybeDeserialize(
  payload: Buffer,
  serialization: number,
): Buffer | Record<string, unknown> | string {
  if (serialization === Serialization.JSON) {
    const text = payload.toString('utf8')
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      // 解析失败回退到字符串，让上层处理（避免静默丢数据）
      return text
    }
  }
  return payload
}

/* ───────────────────────────────────────────────────────────
   encode
   ─────────────────────────────────────────────────────────── */

export interface ControlFrameOptions {
  messageType: MessageTypeValue | number
  flags?: FlagsValue | number
  sequenceNumber?: number
  /** 默认 GZIP，传 NONE 跳过压缩 */
  compression?: CompressionValue | number
  json: Record<string, unknown>
}

/**
 * 编码控制帧（FULL_CLIENT_REQUEST 等）。payload 序列化为 JSON。
 *
 * 默认 flags=POS_SEQUENCE + compression=GZIP，最常见的握手 / start session 形态。
 * 调用方必须提供 sequenceNumber（若 flags 含 sequence 位）。
 */
export function encodeControlFrame(opts: ControlFrameOptions): Buffer {
  const flags = opts.flags ?? Flags.POS_SEQUENCE
  const compression = opts.compression ?? Compression.GZIP

  if (flagsHasSequence(flags) && opts.sequenceNumber === undefined) {
    throw new Error('encodeControlFrame: sequenceNumber required when flags has sequence bit')
  }

  const header: SeedHeader = {
    protocolVersion: PROTOCOL_VERSION,
    headerSize: DEFAULT_HEADER_SIZE,
    messageType: opts.messageType,
    flags,
    serialization: Serialization.JSON,
    compression,
    reserved: 0,
  }

  const rawJson = Buffer.from(JSON.stringify(opts.json), 'utf8')
  const compressed = maybeCompress(rawJson, compression)

  const parts: Buffer[] = [packHeader(header)]
  if (flagsHasSequence(flags)) parts.push(writeUInt32BE(opts.sequenceNumber!))
  parts.push(writeUInt32BE(compressed.length))
  parts.push(compressed)

  return Buffer.concat(parts)
}

export interface AudioFrameOptions {
  /** PCM (或其它原始字节流) */
  pcm: Buffer | Uint8Array
  /** 是否最后一帧；true 时设置 NEG bit */
  isLast?: boolean
  /** 是否使用 sequence number；默认 true（POS / NEG_WITH_SEQUENCE） */
  withSequence?: boolean
  sequenceNumber?: number
  /** 默认 GZIP */
  compression?: CompressionValue | number
}

/**
 * 编码音频数据帧（AUDIO_ONLY_REQUEST）。
 * Payload 不序列化（serialization=NONE），可选 gzip 压缩（默认开）。
 */
export function encodeAudioFrame(opts: AudioFrameOptions): Buffer {
  const withSequence = opts.withSequence ?? true
  const isLast = opts.isLast ?? false
  const compression = opts.compression ?? Compression.GZIP

  let flags: number
  if (withSequence && isLast) flags = Flags.NEG_WITH_SEQUENCE
  else if (withSequence) flags = Flags.POS_SEQUENCE
  else if (isLast) flags = Flags.NEG_SEQUENCE
  else flags = Flags.NO_SEQUENCE

  if (flagsHasSequence(flags) && opts.sequenceNumber === undefined) {
    throw new Error('encodeAudioFrame: sequenceNumber required when withSequence is true')
  }

  const header: SeedHeader = {
    protocolVersion: PROTOCOL_VERSION,
    headerSize: DEFAULT_HEADER_SIZE,
    messageType: MessageType.AUDIO_ONLY_REQUEST,
    flags,
    serialization: Serialization.NONE,
    compression,
    reserved: 0,
  }

  const raw = Buffer.isBuffer(opts.pcm) ? opts.pcm : Buffer.from(opts.pcm)
  const compressed = maybeCompress(raw, compression)

  const parts: Buffer[] = [packHeader(header)]
  if (flagsHasSequence(flags)) parts.push(writeUInt32BE(opts.sequenceNumber!))
  parts.push(writeUInt32BE(compressed.length))
  parts.push(compressed)

  return Buffer.concat(parts)
}

/* ───────────────────────────────────────────────────────────
   decode
   ─────────────────────────────────────────────────────────── */

/**
 * 解码服务器或客户端帧。
 *
 * SERVER_ERROR 帧的 body 是 [errorCode:u32be][len:u32be][payload]；
 * 其它帧 body 是 [sequence:u32be?][len:u32be][payload]，由 flags 决定有无 sequence。
 */
export function decodeFrame(buf: Buffer): SeedFrame {
  const header = unpackHeader(buf)

  // header_size 单位 DWORD，但官方协议固定为 1（4 字节）。若收到 != 1 抛错以便排查。
  if (header.headerSize !== 1) {
    throw new Error(`decodeFrame: unsupported header_size ${header.headerSize}`)
  }

  let offset = 4
  let sequenceNumber: number | undefined
  let errorCode: number | undefined

  if (header.messageType === MessageType.SERVER_ERROR_RESPONSE) {
    errorCode = readUInt32BE(buf, offset)
    offset += 4
  } else if (flagsHasSequence(header.flags)) {
    sequenceNumber = readUInt32BE(buf, offset)
    offset += 4
  }

  const payloadLen = readUInt32BE(buf, offset)
  offset += 4

  if (buf.length < offset + payloadLen) {
    throw new Error(
      `decodeFrame: truncated payload, declared ${payloadLen} bytes, buffer has ${buf.length - offset}`,
    )
  }

  const rawPayload = buf.subarray(offset, offset + payloadLen)
  const decompressed = maybeDecompress(rawPayload, header.compression)
  const payload = maybeDeserialize(decompressed, header.serialization)

  const frame: SeedFrame = { header, payload }
  if (sequenceNumber !== undefined) frame.sequenceNumber = sequenceNumber
  if (errorCode !== undefined) frame.errorCode = errorCode
  return frame
}
