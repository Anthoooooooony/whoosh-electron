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

// Vite 把 worklet 文件单独打成 chunk，?url 后缀拿到运行时 URL
import workletUrl from './worklet/processor.ts?url'

interface CaptureSession {
  stop(): Promise<void>
}

let active: CaptureSession | null = null

export async function startCapture(deviceId: string | null): Promise<void> {
  if (active) {
    console.warn('[audio] startCapture called while active; stopping previous')
    await active.stop()
  }

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
  node.port.onmessage = (event: MessageEvent<ArrayBuffer>): void => {
    const u8 = new Uint8Array(event.data)
    window.ipc.send('audio:chunk', { chunk: u8, timestamp: Date.now() })
    chunkCount++
  }

  source.connect(node)
  // 故意不 connect node 到 ctx.destination

  console.info(
    `[audio] capture started · inputRate=${ctx.sampleRate}Hz · deviceId=${deviceId ?? 'default'}`,
  )

  active = {
    async stop(): Promise<void> {
      node.port.onmessage = null
      node.disconnect()
      source.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      await ctx.close()
      console.info(`[audio] capture stopped · total ${chunkCount} chunks`)
    },
  }
}

export async function stopCapture(): Promise<void> {
  if (!active) return
  const s = active
  active = null
  await s.stop()
}

export function isCapturing(): boolean {
  return active !== null
}
