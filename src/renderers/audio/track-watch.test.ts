// wireTrackEndedHandler 的单测 —— 用 vitest stub track，不需要真实 MediaStreamTrack。

import { describe, expect, it, vi } from 'vitest'
import { wireTrackEndedHandler, type AudioTrackLike, type MediaStreamLike } from './track-watch.js'

function makeFakeTrack(readyState: 'live' | 'ended' = 'live') {
  let endedHandler: (() => void) | null = null
  const track: AudioTrackLike = {
    readyState,
    addEventListener(type, listener) {
      if (type === 'ended') endedHandler = listener
    },
    removeEventListener(type, listener) {
      if (type === 'ended' && endedHandler === listener) endedHandler = null
    },
  }
  return {
    track,
    /** 模拟系统级 'ended' 事件 */
    fireEnded: (): void => {
      endedHandler?.()
    },
    isListenerAttached: (): boolean => endedHandler !== null,
  }
}

function makeStream(track: AudioTrackLike | null): MediaStreamLike {
  return { getAudioTracks: () => (track ? [track] : []) }
}

describe('wireTrackEndedHandler', () => {
  it('track ended 时调用回调一次', () => {
    const onEnded = vi.fn()
    const { track, fireEnded } = makeFakeTrack()
    wireTrackEndedHandler(makeStream(track), onEnded)
    fireEnded()
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('同一 ended 事件再触发 → 回调不重复（idempotent）', () => {
    const onEnded = vi.fn()
    const { track, fireEnded } = makeFakeTrack()
    wireTrackEndedHandler(makeStream(track), onEnded)
    fireEnded()
    fireEnded()
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('调返回的 unsubscribe 后 ended 不再触发回调', () => {
    const onEnded = vi.fn()
    const { track, fireEnded, isListenerAttached } = makeFakeTrack()
    const off = wireTrackEndedHandler(makeStream(track), onEnded)
    off()
    expect(isListenerAttached()).toBe(false)
    fireEnded()
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('stream 没有 audio track → 返回 no-op，不抛错', () => {
    const onEnded = vi.fn()
    const off = wireTrackEndedHandler(makeStream(null), onEnded)
    off() // 不抛
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('track 已经处于 ended 状态 → 立即同步触发一次（兜底极端时序）', () => {
    const onEnded = vi.fn()
    const { track } = makeFakeTrack('ended')
    wireTrackEndedHandler(makeStream(track), onEnded)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })
})
