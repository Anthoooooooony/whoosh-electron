// 把 MediaStream 上第一条 audio track 的 'ended' 事件桥接成一个简单的回调。
// 抽出来是为了让 bridge.ts 里的 mic-lost 逻辑能跑在 node 测试环境里
// （bridge.ts 本身 import 了 vite-only 的 ?worker&url，无法在 vitest 直接加载）。
//
// 触发场景：
//   - 用户在系统设置里撤销了麦克风权限
//   - 输入设备被拔掉 / 被其他进程抢占
//   - 浏览器（Electron renderer）主动 stop track 时也会 emit；但走 stopCapture 路径
//     已经先 off listener，所以不会双触发。
//
// 返回 unsubscribe，调用方在主动拆 session 时调用一次即可释放 listener。

export interface AudioTrackLike {
  addEventListener(type: 'ended', listener: () => void): void
  removeEventListener(type: 'ended', listener: () => void): void
  readyState?: 'live' | 'ended'
}

export interface MediaStreamLike {
  getAudioTracks(): AudioTrackLike[]
}

export function wireTrackEndedHandler(stream: MediaStreamLike, onEnded: () => void): () => void {
  const track = stream.getAudioTracks()[0]
  if (!track) return () => {}

  // 极端情况：track 已经在 ready 状态前就 ended（很快被撤权）。同步触发一次保平安。
  if (track.readyState === 'ended') {
    onEnded()
    return () => {}
  }

  let fired = false
  const handler = (): void => {
    if (fired) return
    fired = true
    onEnded()
  }
  track.addEventListener('ended', handler)
  return () => {
    track.removeEventListener('ended', handler)
  }
}
