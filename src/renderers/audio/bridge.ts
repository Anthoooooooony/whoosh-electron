// Audio capture pipeline，由 audio renderer 调用。
//
// 流程：
//   1. getUserMedia(deviceId) 取麦克风 MediaStream
//   2. new AudioContext()，加载 AudioWorklet 模块
//   3. MediaStreamSource → AudioWorkletNode（downsample-processor）
//   4. workletNode.port.onmessage 接到 Int16Array.buffer，转 Uint8Array
//      经 window.ipc.send('audio:chunk') 推回 main
//
// 注意：AudioWorkletNode 故意不 connect 到 ctx.destination —— 避免把麦克风回放出来。
//
// 并发：startCapture / stopCapture 用 pending promise 串行化。`active` 在 startCapture
// 末尾才置位，若不串行化，短按场景（START 后 50ms 内就 ABORT）的两次调用会各开一套
// getUserMedia + AudioContext，先完成的那套无人 stop 而泄漏。
//
// 错误兜底：MediaStreamTrack.onended 触发（用户系统设置撤销麦克风权限 / 设备拔出）
// → 通过 AUDIO_CAPTURE_ENDED 通知 main，让 orchestrator 走 surfaceError 而不是 silent
// drop（见 issue #60 W4-P1-2）。

// Vite 的 worker 管线会转译 + 打包 processor.ts 成独立 chunk，?worker&url 拿到它的 URL。
// 用 ?url 会把 .ts 当静态资源不转译，打包后 addModule 拿到原始 TS 直接 SyntaxError（见 #41）。
import workletUrl from './worklet/processor.ts?worker&url'
import { Channels } from '@shared/ipc/channels.js'
import { wireTrackEndedHandler } from './track-watch.js'

interface CaptureSession {
  stop(): Promise<void>
}

let active: CaptureSession | null = null
// 在途的 start/stop —— 入口同步读它即拿到护栏，避免 active 晚置位带来的并发竞态
let pending: Promise<void> | null = null

async function openCaptureSession(deviceId: string | null): Promise<CaptureSession> {
  const constraints: MediaStreamConstraints = {
    audio: deviceId
      ? { deviceId: { exact: deviceId } }
      : {
          // 关掉浏览器对人声的"美化"，原始 PCM 喂 ASR 效果更好
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
    video: false,
  }

  const stream = await navigator.mediaDevices.getUserMedia(constraints)
  const ctx = new AudioContext()
  await ctx.audioWorklet.addModule(workletUrl)
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'downsample-processor')

  let chunkCount = 0
  let toreDown = false
  // teardown 与 offTrackEnded 互相引用：teardown 要 off listener，listener 要触发 teardown。
  // 用 let 先占位，下面把真实回调赋上。
  let offTrackEnded: () => void = () => {}

  node.port.onmessage = (event: MessageEvent<ArrayBuffer>): void => {
    const u8 = new Uint8Array(event.data)
    window.ipc.send(Channels.AUDIO_CHUNK, { chunk: u8, timestamp: Date.now() })
    chunkCount++
  }

  source.connect(node)
  // 故意不 connect node 到 ctx.destination

  const teardown = async (): Promise<void> => {
    if (toreDown) return
    toreDown = true
    offTrackEnded()
    node.port.onmessage = null
    node.disconnect()
    source.disconnect()
    stream.getTracks().forEach((t) => t.stop())
    if (ctx.state !== 'closed') await ctx.close()
    console.info(`[audio] capture stopped · total ${chunkCount} chunks`)
  }

  const capture: CaptureSession = { stop: teardown }

  // 麦克风权限被撤销 / 设备被抢占时 track 会 ended：通知 main → SESSION_ERROR。
  // 顺手把本地 session 拆掉，避免后续 stopCapture 重复拆；
  // 用 active === capture 判定确保不覆盖刚切换上来的新 session。
  offTrackEnded = wireTrackEndedHandler(stream, () => {
    if (active === capture) active = null
    void teardown().catch(() => {})
    window.ipc.send(Channels.AUDIO_CAPTURE_ENDED, { reason: 'mic-lost' })
  })

  console.info(
    `[audio] capture started · inputRate=${ctx.sampleRate}Hz · deviceId=${deviceId ?? 'default'}`,
  )

  return capture
}

export async function startCapture(deviceId: string | null): Promise<void> {
  // 等任何在途的 start/stop 落定，再判 active —— 杜绝并发开多套 pipeline
  if (pending) await pending
  if (active) {
    console.warn('[audio] startCapture called while active; stopping previous')
    await stopCapture()
  }

  const task = openCaptureSession(deviceId).then((session) => {
    active = session
  })
  pending = task
  try {
    await task
  } finally {
    pending = null
  }
}

export async function stopCapture(): Promise<void> {
  // 若有在途的 start，先等它落定，确保停的是真实建好的 session
  if (pending) await pending
  if (!active) return
  const session = active
  active = null

  const task = session.stop()
  pending = task
  try {
    await task
  } finally {
    pending = null
  }
}
