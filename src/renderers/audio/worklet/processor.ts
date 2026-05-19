// AudioWorklet processor —— 麦克风 float32 → 16kHz mono s16le PCM
//
// 设计要点：
//   - AudioWorklet 的 process() 每 128 帧调用一次（约 2.67ms @ 48k）；攒到 40ms
//     才下采样并 postMessage，减少 IPC 频次（25 chunks/s @ 40ms）。
//   - 下采样用线性插值（v1 简化方案）。对 ASR 而言 16kHz 已远高于人声 8kHz 带宽，
//     不需要精确低通滤波；若实测识别率下降再补 FIR + decimation。
//   - 输出为 Int16Array.buffer（transferable），主线程拿到后直接转 Uint8Array
//     喂 IPC，无需额外拷贝。
//   - 单声道：若 mic 输出立体声，只取 channel 0。
//
// 结构：纯 DSP 在 createResampler（可被 resampler.test.ts 直接 import 测）；
//       DownsampleProcessor 是绑定 AudioWorkletGlobalScope 的薄壳。
// AudioWorkletGlobalScope 提供 globalThis.sampleRate（输入采样率）、
// globalThis.AudioWorkletProcessor 和 globalThis.registerProcessor。

// AudioWorkletProcessor 子类约束：构造期不带参，process(...) 返回 boolean。
// 这里用最小约束的 constructor 类型，避免 any 也不强行重建整套 Web Audio API 类型。
type AudioWorkletProcessorCtor = new () => { readonly port: MessagePort }

declare const sampleRate: number
declare function registerProcessor(name: string, processor: AudioWorkletProcessorCtor): void

const OUTPUT_SAMPLE_RATE = 16000
const CHUNK_MS = 40
const FRAMES_PER_CHUNK_OUTPUT = (OUTPUT_SAMPLE_RATE * CHUNK_MS) / 1000 // 640

export interface Resampler {
  /**
   * 累积输入帧；每攒满一个 40ms 输入块就下采样出一个 640-sample 的 16kHz s16le chunk。
   * 单次 push 可能产出 0、1 或多个 chunk；尾部不足一块的残留留到下次 push。
   */
  push(frames: Float32Array): Int16Array[]
}

/** 纯下采样器 —— 不依赖任何 worklet 全局，可在普通环境（含 vitest）构造与测试 */
export function createResampler(inputSampleRate: number): Resampler {
  const framesPerChunkInput = Math.round((inputSampleRate * CHUNK_MS) / 1000)
  const buffer = new Float32Array(framesPerChunkInput)
  let bufferLen = 0

  function downsampleBuffer(): Int16Array {
    const out = new Int16Array(FRAMES_PER_CHUNK_OUTPUT)
    const ratio = framesPerChunkInput / FRAMES_PER_CHUNK_OUTPUT
    for (let i = 0; i < FRAMES_PER_CHUNK_OUTPUT; i++) {
      const srcIdx = i * ratio
      const srcLow = Math.floor(srcIdx)
      const srcHigh = Math.min(srcLow + 1, framesPerChunkInput - 1)
      const frac = srcIdx - srcLow
      const a = buffer[srcLow] ?? 0
      const b = buffer[srcHigh] ?? 0
      const sample = a * (1 - frac) + b * frac
      const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample
      out[i] = Math.round(clamped * 32767)
    }
    return out
  }

  return {
    push(frames: Float32Array): Int16Array[] {
      const chunks: Int16Array[] = []
      let consumed = 0
      while (consumed < frames.length) {
        const need = framesPerChunkInput - bufferLen
        const take = Math.min(need, frames.length - consumed)
        buffer.set(frames.subarray(consumed, consumed + take), bufferLen)
        bufferLen += take
        consumed += take

        if (bufferLen >= framesPerChunkInput) {
          chunks.push(downsampleBuffer())
          bufferLen = 0
        }
      }
      return chunks
    },
  }
}

// ↓ 仅在 AudioWorkletGlobalScope 有意义。vitest 直接 import 本文件取 createResampler 时，
//   globalThis.AudioWorkletProcessor / registerProcessor 不存在 —— 用空基类兜底、跳过注册，
//   使 class 定义不抛、import 不触发 worklet 注册。
// 空基类的 port 字段在 vitest 路径下永远不会被访问（只有 createResampler 被 import），
// 故塑形成 ctor 即可，无需真实 MessagePort 占位。
const WorkletProcessorBase: AudioWorkletProcessorCtor =
  (globalThis as { AudioWorkletProcessor?: AudioWorkletProcessorCtor }).AudioWorkletProcessor ??
  (class {} as unknown as AudioWorkletProcessorCtor)

class DownsampleProcessor extends WorkletProcessorBase {
  private readonly resampler = createResampler(sampleRate)

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0]
    if (channel && channel.length > 0) {
      for (const chunk of this.resampler.push(channel)) {
        // 传 ArrayBuffer + transfer，零拷贝
        this.port.postMessage(chunk.buffer, [chunk.buffer])
      }
    }
    return true
  }
}

if (typeof registerProcessor !== 'undefined') {
  registerProcessor('downsample-processor', DownsampleProcessor)
}
