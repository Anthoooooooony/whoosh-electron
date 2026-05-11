// IPC channel 名常量 —— 单一来源
// 命名空间：audio / session / hud / settings / provider / onboarding / permission / updater
//
// 方向语义：
//   invoke   — renderer ↔ main，请求/响应
//   send     — renderer → main，单向
//   broadcast— main → renderer(s)，单向

export const Channels = {
  // 音频子系统
  AUDIO_CHUNK: 'audio:chunk', // send: audio-renderer → main
  AUDIO_DEVICE_LIST: 'audio:device-list', // invoke
  AUDIO_SET_DEVICE: 'audio:set-device', // send
  AUDIO_START: 'audio:start', // broadcast: main → audio-renderer
  AUDIO_STOP: 'audio:stop', // broadcast
  AUDIO_ABORT: 'audio:abort', // broadcast

  // 会话
  SESSION_STATE: 'session:state', // broadcast
  SESSION_PARTIAL: 'session:partial', // broadcast: main → hud
  SESSION_FINAL: 'session:final', // broadcast: main → hud
  SESSION_ERROR: 'session:error', // broadcast: main → hud

  // HUD
  HUD_CANCEL: 'hud:cancel', // send: hud → main
  HUD_SHOW: 'hud:show', // broadcast: main → hud
  HUD_HIDE: 'hud:hide', // broadcast: main → hud

  // 设置
  SETTINGS_GET: 'settings:get', // invoke
  SETTINGS_SET: 'settings:set', // invoke
  SETTINGS_GET_APIKEY: 'settings:get-apikey', // invoke
  SETTINGS_SET_APIKEY: 'settings:set-apikey', // invoke

  // Provider
  PROVIDER_TEST_CONNECTION: 'provider:test-connection', // invoke

  // Onboarding
  ONBOARDING_GET_STEP: 'onboarding:get-step', // invoke
  ONBOARDING_COMPLETE_STEP: 'onboarding:complete-step', // invoke
  ONBOARDING_DONE: 'onboarding:done', // send

  // 权限
  PERMISSION_STATUS: 'permission:status', // invoke
  PERMISSION_REQUEST_MIC: 'permission:request-mic', // invoke
  PERMISSION_OPEN_SYSTEM_PREFS: 'permission:open-system-prefs', // send

  // 更新
  UPDATER_CHECK: 'updater:check', // invoke
  UPDATER_NEW_VERSION: 'updater:new-version', // broadcast

  // 应用控制
  APP_RELAUNCH: 'app:relaunch', // send: renderer → main，触发 app.relaunch() + exit
} as const

export type ChannelName = (typeof Channels)[keyof typeof Channels]
