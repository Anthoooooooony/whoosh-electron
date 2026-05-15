// 麦克风输入设备列表 hook —— settings / onboarding 共用
//
// enumerateDevices 拿到全部设备后过滤出 audioinput，并排掉浏览器自带的
// default / communications 入口（UI 已单独提供「系统默认」一项）。
// 挂 devicechange 监听，设备增删时自动刷新。

import { useCallback, useEffect, useState } from 'react'

export interface DeviceInfo {
  deviceId: string
  label: string
}

async function listAudioInputDevices(): Promise<DeviceInfo[]> {
  const list = await navigator.mediaDevices.enumerateDevices()
  return list
    .filter((d) => d.kind === 'audioinput')
    .filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d) => ({ deviceId: d.deviceId, label: d.label || '未命名设备' }))
}

export function useAudioInputDevices(): {
  devices: DeviceInfo[]
  refresh: () => Promise<void>
} {
  const [devices, setDevices] = useState<DeviceInfo[]>([])

  const refresh = useCallback(async () => {
    try {
      setDevices(await listAudioInputDevices())
    } catch (err) {
      console.error('[audio-devices] enumerateDevices failed', err)
    }
  }, [])

  useEffect(() => {
    void refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh)
  }, [refresh])

  return { devices, refresh }
}
