// AudioWorklet processor —— 麦克风 float32 → 16kHz mono s16le PCM
//
// 设计要点：
//   - AudioWorklet 的 process() 每 128 帧调用一次（约 2.67ms @ 48k）；我们攒到 40ms
//     才下采样并 postMessage，减少 IPC 频次（25 chunks/s @ 40ms）。
//   - 下采样用线性插值（v1 简化方案）。对 ASR 而言 16kHz 已远高于人声 8kHz 带宽，
//     不需要精确低通滤波；若实测识别率下降再补 FIR + decimation。
//   - 输出为 Int16Array.buffer（transferable），主线程拿到后直接转 Uint8Array
//     喂 IPC，无需额外拷贝。
//   - 单声道：若 mic 输出立体声，只取 channel 0。
//
// AudioWorkletGlobalScope 提供 globalThis.sampleRate（输入采样率）和
// globalThis.registerProcessor。

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const sampleRate: number
declare function registerProcessor(name: string, processor: any): void

const OUTPUT_SAMPLE_RATE = 16000
const CHUNK_MS = 40
const FRAMES_PER_CHUNK_OUTPUT = (OUTPUT_SAMPLE_RATE * CHUNK_MS) / 1000 // 640

class DownsampleProcessor extends (globalThis as any).AudioWorkletProcessor {
  private readonly inputSampleRate: number
  private readonly framesPerChunkInput: number
  private buffer: Float32Array
  private bufferLen = 0

  constructor() {
    super()
    this.inputSampleRate = sampleRate
    this.framesPerChunkInput = Math.round((this.inputSampleRate * CHUNK_MS) / 1000)
    this.buffer = new Float32Array(this.framesPerChunkInput)
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const channel = input[0]
    if (!channel || channel.length === 0) return true

    let consumed = 0
    while (consumed < channel.length) {
      const need = this.framesPerChunkInput - this.bufferLen
      const take = Math.min(need, channel.length - consumed)
      this.buffer.set(channel.subarray(consumed, consumed + take), this.bufferLen)
      this.bufferLen += take
      consumed += take

      if (this.bufferLen >= this.framesPerChunkInput) {
        this.emitChunk()
        this.bufferLen = 0
      }
    }
    return true
  }

  private emitChunk(): void {
    const out = new Int16Array(FRAMES_PER_CHUNK_OUTPUT)
    const ratio = this.framesPerChunkInput / FRAMES_PER_CHUNK_OUTPUT
    for (let i = 0; i < FRAMES_PER_CHUNK_OUTPUT; i++) {
      const srcIdx = i * ratio
      const srcLow = Math.floor(srcIdx)
      const srcHigh = Math.min(srcLow + 1, this.framesPerChunkInput - 1)
      const frac = srcIdx - srcLow
      const a = this.buffer[srcLow] ?? 0
      const b = this.buffer[srcHigh] ?? 0
      const sample = a * (1 - frac) + b * frac
      const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample
      out[i] = Math.round(clamped * 32767)
    }
    // 传 ArrayBuffer + transfer，零拷贝
    ;(this as any).port.postMessage(out.buffer, [out.buffer])
  }
}

registerProcessor('downsample-processor', DownsampleProcessor)
