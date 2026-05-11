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
/**
 * 三个流式 endpoint 变体：
 *   bigmodel        — 双向流式标准版：每输入一包返回一包
 *   bigmodel_async  — 双向流式优化版：仅结果变化时返回（推荐 v1，更省带宽 + 更低延迟）
 *   bigmodel_nostream — 流式输入模式：≥15s 或 last 包后才返回；不适合"按住即说"
 */
export const Endpoint = {
  bigmodel: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
  bigmodel_async: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
  bigmodel_nostream: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream',
} as const
export type EndpointKey = keyof typeof Endpoint
export const DEFAULT_ENDPOINT_KEY: EndpointKey = 'bigmodel_async'

/**
 * Resource ID 取决于服务版本与计费方式：
 *   v1 (BigASR)     · 小时版 = volc.bigasr.sauc.duration
 *   v1 (BigASR)     · 并发版 = volc.bigasr.sauc.concurrent
 *   v2 (SeedASR 2.0)· 小时版 = volc.seedasr.sauc.duration
 *   v2 (SeedASR 2.0)· 并发版 = volc.seedasr.sauc.concurrent
 *
 * 新版控制台开通的"流式语音识别 2.0"对应 v2 系列。
 */
export const ResourceId = {
  v1_duration: 'volc.bigasr.sauc.duration',
  v1_concurrent: 'volc.bigasr.sauc.concurrent',
  v2_duration: 'volc.seedasr.sauc.duration',
  v2_concurrent: 'volc.seedasr.sauc.concurrent',
} as const
export type ResourceIdKey = keyof typeof ResourceId
export const DEFAULT_RESOURCE_ID = ResourceId.v2_duration

/* ─── HTTP request headers ───────────────────────────────── */
export const Header = {
  // 新版控制台（单 API Key 模式）
  ApiKey: 'X-Api-Key',
  // 旧版控制台（App Key + Access Key 双 header）
  ApiAppKey: 'X-Api-App-Key',
  ApiAccessKey: 'X-Api-Access-Key',
  // 通用
  ApiResourceId: 'X-Api-Resource-Id',
  ApiRequestId: 'X-Api-Request-Id',
  ApiSequence: 'X-Api-Sequence', // 固定 -1
  ApiConnectId: 'X-Api-Connect-Id',
  // 响应
  TtLogid: 'X-Tt-Logid',
} as const

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
