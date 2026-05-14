// createResampler 的纯 DSP 测试 —— 累积/分块、int16 量化与 clamp、下采样数学。
// 直接 import processor.ts：worklet 全局缺失时基类兜底为空类、registerProcessor 被 typeof 守护跳过。

import { describe, expect, it } from 'vitest'
import { createResampler } from './processor.js'

describe('createResampler', () => {
  describe('累积与分块', () => {
    it('不足一个输入块 → 不产出', () => {
      const rs = createResampler(48000) // framesPerChunkInput = 1920
      expect(rs.push(new Float32Array(100))).toEqual([])
    })

    it('刚好攒满一个输入块 → 产出一个 640-sample chunk', () => {
      const rs = createResampler(48000)
      const chunks = rs.push(new Float32Array(1920))
      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toBeInstanceOf(Int16Array)
      expect(chunks[0]).toHaveLength(640)
    })

    it('跨多次 push 累积到一块', () => {
      const rs = createResampler(48000)
      expect(rs.push(new Float32Array(1000))).toEqual([])
      expect(rs.push(new Float32Array(920))).toHaveLength(1) // 1000 + 920 = 1920
    })

    it('单次 push 跨多个输入块 → 产出多个 chunk', () => {
      const rs = createResampler(48000)
      expect(rs.push(new Float32Array(1920 * 3))).toHaveLength(3)
    })

    it('空输入 → 不产出', () => {
      const rs = createResampler(48000)
      expect(rs.push(new Float32Array(0))).toEqual([])
    })
  })

  describe('量化与 clamp', () => {
    it('常量 1.0 → 全 32767', () => {
      const [chunk] = createResampler(16000).push(new Float32Array(640).fill(1))
      expect(chunk!.every((v) => v === 32767)).toBe(true)
    })

    it('常量 0 → 全 0', () => {
      const [chunk] = createResampler(16000).push(new Float32Array(640).fill(0))
      expect(chunk!.every((v) => v === 0)).toBe(true)
    })

    it('常量 0.5 → 全 16384（round(0.5 * 32767)）', () => {
      const [chunk] = createResampler(16000).push(new Float32Array(640).fill(0.5))
      expect(chunk!.every((v) => v === 16384)).toBe(true)
    })

    it('超出 [-1, 1] 的样本被 clamp', () => {
      const [hi] = createResampler(16000).push(new Float32Array(640).fill(2))
      expect(hi!.every((v) => v === 32767)).toBe(true)
      const [lo] = createResampler(16000).push(new Float32Array(640).fill(-2))
      expect(lo!.every((v) => v === -32767)).toBe(true)
    })
  })

  describe('下采样', () => {
    it('不同输入采样率，输出恒为 640 sample', () => {
      for (const rate of [16000, 44100, 48000]) {
        const framesPerChunkInput = Math.round((rate * 40) / 1000)
        const [chunk] = createResampler(rate).push(new Float32Array(framesPerChunkInput).fill(1))
        expect(chunk).toHaveLength(640)
      }
    })

    it('整数倍率（32k→16k，ratio=2）：输出即对输入隔点抽取', () => {
      const rs = createResampler(32000) // framesPerChunkInput = 1280, ratio = 2
      const input = new Float32Array(1280)
      for (let j = 0; j < 1280; j++) input[j] = j / 1280
      const [chunk] = rs.push(input)
      // output[i] = input[2i]
      expect(chunk![0]).toBe(0)
      expect(chunk![320]).toBe(Math.round((640 / 1280) * 32767))
      expect(chunk![639]).toBe(Math.round((1278 / 1280) * 32767))
    })

    it('非整数倍率（24k→16k，ratio=1.5）：线性插值，斜坡输入输出单调', () => {
      const rs = createResampler(24000) // framesPerChunkInput = 960, ratio = 1.5
      const input = new Float32Array(960)
      for (let j = 0; j < 960; j++) input[j] = j / 960
      const [chunk] = rs.push(input)

      expect(chunk![0]).toBe(0)
      let monotonic = true
      for (let i = 1; i < 640; i++) if (chunk![i]! < chunk![i - 1]!) monotonic = false
      expect(monotonic).toBe(true)
      // output[100] 的 srcIdx = 150（整数）→ input[150]
      expect(chunk![100]).toBe(Math.round((150 / 960) * 32767))
      // output[1] 的 srcIdx = 1.5 → 0.5*input[1] + 0.5*input[2] = 1.5/960
      expect(chunk![1]).toBe(Math.round((1.5 / 960) * 32767))
    })
  })
})
