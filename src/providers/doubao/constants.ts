// 豆包大模型流式语音识别 · Seed 协议常量
//
// 协议 wire format (4-byte header):
//   Byte 0: [protocol_version:4 | header_size:4]
//   Byte 1: [message_type:4     | flags:4      ]
//   Byte 2: [serialization:4    | compression:4]
//   Byte 3: [reserved:8                        ]
//
// header_size 单位是 4 字节（DWORD），固定为 1（=4 字节 header）。
//
// header 之后的 body 布局取决于 flags 中的 sequence 位：
//   - flags 含 sequence 位 (POS_SEQUENCE | NEG_WITH_SEQUENCE):
//       [4-byte BE sequence number][4-byte BE payload length][payload bytes]
//   - flags 不含 sequence 位 (NO_SEQUENCE | NEG_SEQUENCE):
//       [4-byte BE payload length][payload bytes]
//
// SERVER_ERROR 是例外：header 后跟 [4-byte BE error code][4-byte BE payload length][payload]，
// 解码时单独处理。
//
// payload 是否 gzip 压缩看 header 的 compression 位。
// payload 是否是 JSON 看 header 的 serialization 位。

/* ─── endpoint ───────────────────────────────────────────── */
export const DOUBAO_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel'
export const DEFAULT_RESOURCE_ID = 'volc.bigasr.sauc.duration'

/* ─── header field constants ─────────────────────────────── */
export const PROTOCOL_VERSION = 0b0001
export const DEFAULT_HEADER_SIZE = 0b0001 // = 4 bytes (单位 DWORD)

/** Header byte 1 高 4 位：消息类型 */
export const MessageType = {
  FULL_CLIENT_REQUEST: 0b0001,
  AUDIO_ONLY_REQUEST: 0b0010,
  FULL_SERVER_RESPONSE: 0b1001,
  SERVER_ACK: 0b1011,
  SERVER_ERROR_RESPONSE: 0b1111,
} as const
export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType]

/**
 * Header byte 1 低 4 位：消息类型独立 flags（按位组合）
 *   bit 0 (0x1): 携带 sequence number
 *   bit 1 (0x2): 是最后一帧（"negative" 方向标记，会话结束）
 *
 * 协议常用的 4 个组合：
 */
export const Flags = {
  NO_SEQUENCE: 0b0000,
  POS_SEQUENCE: 0b0001,
  NEG_SEQUENCE: 0b0010,
  NEG_WITH_SEQUENCE: 0b0011,
} as const
export type FlagsValue = (typeof Flags)[keyof typeof Flags]

export function flagsHasSequence(flags: number): boolean {
  return (flags & 0b0001) !== 0
}

export function flagsIsLast(flags: number): boolean {
  return (flags & 0b0010) !== 0
}

/** Header byte 2 高 4 位：payload 序列化格式 */
export const Serialization = {
  NONE: 0b0000,
  JSON: 0b0001,
} as const
export type SerializationValue = (typeof Serialization)[keyof typeof Serialization]

/** Header byte 2 低 4 位：payload 压缩 */
export const Compression = {
  NONE: 0b0000,
  GZIP: 0b0001,
} as const
export type CompressionValue = (typeof Compression)[keyof typeof Compression]
