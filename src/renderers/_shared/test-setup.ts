// Vitest dom project 的全局 setup —— 仅 `*.test.tsx` 通过 vitest.config.ts 加载本文件
//
// 职责：
//   1. 装 @testing-library/jest-dom 的可读 matcher（toBeInTheDocument 等）
//   2. mock window.ipc 为 IpcApi 形状的 stub，按 channel 返回最小合法 payload
//   3. mock react-i18next 让 `t(key)` 直接返回 key 本身，避免拉真实 locale 资源
//   4. mock window.platform 为 'darwin'（renderer 在 dev 时 preload 注入）
//
// 注意：本文件**不**碰 i18next 本体 —— renderer main.tsx 仍会 `initI18n()`，
// 但因 react-i18next 被整体 mock，init 的副作用对组件渲染无影响。

import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import { Channels } from '@shared/ipc/channels.js'
import type { IpcApi } from '@shared/ipc/types.js'

// 按 channel 返回最小合法响应；renderer 在 useEffect 里通常 invoke 一次拉初值，
// 这里给出能让组件挂载完成而不抛的默认 shape。
function defaultInvokeResponse(channel: string): unknown {
  switch (channel) {
    case Channels.SETTINGS_GET:
      return {
        audio: { inputDeviceId: null },
        providers: { doubao: {} },
        currentProviderId: 'doubao',
        behavior: { showHudWhenRecording: true, openAtLogin: false },
        logging: { verbose: false },
        ui: { locale: 'zh-CN' },
      }
    case Channels.SETTINGS_SET:
      return {
        audio: { inputDeviceId: null },
        providers: { doubao: {} },
        currentProviderId: 'doubao',
        behavior: { showHudWhenRecording: true, openAtLogin: false },
        logging: { verbose: false },
        ui: { locale: 'zh-CN' },
      }
    case Channels.SETTINGS_GET_APIKEY:
      return { key: null }
    case Channels.SETTINGS_SET_APIKEY:
      return { ok: true }
    case Channels.AUDIO_DEVICE_LIST:
      return []
    case Channels.ONBOARDING_GET_STEP:
      return { step: 1, platform: 'darwin' }
    case Channels.ONBOARDING_COMPLETE_STEP:
      return { nextStep: null }
    case Channels.PERMISSION_STATUS:
      return { mic: true, accessibility: true }
    case Channels.PERMISSION_REQUEST_MIC:
      return { granted: true }
    case Channels.PROVIDER_TEST_CONNECTION:
      return { ok: true, latencyMs: 0 }
    case Channels.UPDATER_CHECK:
      return { hasUpdate: false }
    default:
      return undefined
  }
}

const ipcStub: IpcApi = {
  invoke: vi.fn((channel: string) =>
    Promise.resolve(defaultInvokeResponse(channel)),
  ) as IpcApi['invoke'],
  send: vi.fn() as IpcApi['send'],
  on: vi.fn(() => () => {}) as IpcApi['on'],
}

Object.defineProperty(window, 'ipc', {
  configurable: true,
  writable: true,
  value: ipcStub,
})

Object.defineProperty(window, 'platform', {
  configurable: true,
  writable: true,
  value: 'darwin',
})

// mock react-i18next：`t(key)` 直接返回 key，避免依赖 locale json。
// useTranslation 返回的 i18n 对象保留 changeLanguage / language 这俩组件可能访问的字段。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: {
      language: 'zh-CN',
      changeLanguage: vi.fn(),
    },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  Trans: ({ children }: { children?: unknown }) => children,
}))

// mock useAudioInputDevices —— 浏览器 mediaDevices.enumerateDevices 在 happy-dom 下不可用，
// renderer 顶层 useEffect 调它会抛；统一返回空设备列表，保持 hook 的形状契约。
vi.mock('@renderers/_shared/use-audio-devices.js', () => ({
  useAudioInputDevices: () => ({
    devices: [],
    refresh: vi.fn(() => Promise.resolve()),
  }),
}))
