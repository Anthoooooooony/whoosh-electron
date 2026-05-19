// SessionOrchestrator 的生产 adapter —— 把 HudPort / AudioRendererPort 落到
// Electron WebContents + IPC channel 上。测试不走这里（用 fake port）。

import { Channels } from '@shared/ipc/channels.js'
import type { ASRError } from '@shared/types/provider.js'
import type { AppConfig } from '../store/index.js'
import { hideHudWindow, showHudOnActiveScreen, type AppWindows } from '../windows.js'
import type { AudioRendererPort, HudPort } from './ports.js'

/** ASRError.code（provider 词汇）→ IPC SESSION_ERROR 的 code 枚举 */
function mapErrorCode(
  code: ASRError['code'],
): 'NETWORK_ERROR' | 'PROVIDER_AUTH' | 'PROVIDER_QUOTA' | 'UNKNOWN' {
  switch (code) {
    case 'AUTH':
      return 'PROVIDER_AUTH'
    case 'QUOTA':
      return 'PROVIDER_QUOTA'
    case 'NETWORK':
      return 'NETWORK_ERROR'
    default:
      return 'UNKNOWN'
  }
}

export function createHudAdapter(getAppWindows: () => AppWindows | null): HudPort {
  const hudWc = (): Electron.WebContents | undefined => getAppWindows()?.hud.webContents
  return {
    showState: (state) => hudWc()?.send(Channels.HUD_SHOW, { state }),
    hide: () => hudWc()?.send(Channels.HUD_HIDE),
    partial: (text) => hudWc()?.send(Channels.SESSION_PARTIAL, { text }),
    final: (text, durationMs) => hudWc()?.send(Channels.SESSION_FINAL, { text, durationMs }),
    error: (err) =>
      hudWc()?.send(Channels.SESSION_ERROR, {
        code: mapErrorCode(err.code),
        message: err.message,
        // i18nKey 由 orchestrator 的「未配置 provider」分支注入；provider 自身抛错通常不带，
        // 此时 HUD 降级到 message。exactOptionalPropertyTypes 下需展开后只在有值时挂上
        ...(err.i18nKey !== undefined ? { i18nKey: err.i18nKey } : {}),
      }),
    showWindow: () => showHudOnActiveScreen(),
    hideWindow: () => hideHudWindow(),
  }
}

export function createAudioRendererAdapter(
  getAppWindows: () => AppWindows | null,
  getConfig: () => AppConfig,
): AudioRendererPort {
  const audioWc = (): Electron.WebContents | undefined => getAppWindows()?.audio.webContents
  return {
    start: () =>
      audioWc()?.send(Channels.AUDIO_START, {
        deviceId: getConfig().audio.inputDeviceId || null,
      }),
    stop: () => audioWc()?.send(Channels.AUDIO_STOP),
    abort: () => audioWc()?.send(Channels.AUDIO_ABORT),
  }
}
