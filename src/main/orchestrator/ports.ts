// SessionOrchestrator 的 seam —— orchestrator 经这组 typed port 驱动 HUD / audio
// renderer，自己不持有 Electron WebContents、不认识 IPC channel 常量。
//
// 生产 adapter 见 adapters.ts；测试用 fake port，见 index.test.ts。

import type { ASRError, ASRProvider } from '@shared/types/provider.js'

/** orchestrator 驱动 HUD 的全部出口：IPC 内容推送 + OS 级窗口显隐 */
export interface HudPort {
  /** 切 HUD 视觉态（hud:show） */
  showState(state: 'recording' | 'processing' | 'error'): void
  /** 收起 HUD 内容（hud:hide） */
  hide(): void
  /** 推流式中间结果（session:partial） */
  partial(text: string): void
  /** 推最终结果（session:final） */
  final(text: string, durationMs: number): void
  /** 推错误（session:error）；adapter 负责把 ASRError.code 映射到 IPC error code */
  error(err: ASRError): void
  /** OS 级把 HUD BrowserWindow 显示到 active screen（showInactive，不抢焦点） */
  showWindow(): void
  /** OS 级隐藏 HUD BrowserWindow */
  hideWindow(): void
}

/** orchestrator 驱动 audio renderer 的全部出口 */
export interface AudioRendererPort {
  /** 启动采集（audio:start）；输入设备由 adapter 自行从配置解析 */
  start(): void
  /** 正常停止采集（audio:stop） */
  stop(): void
  /** 中止采集、丢弃缓冲（audio:abort） */
  abort(): void
}

/**
 * paste 调用结果 —— 三态 discriminated union。
 *
 * 与 src/native/paste/index.ts 的 PasteResult 镜像，但 port 层重新定义以保持
 * orchestrator 不依赖 native 模块；adapter 负责翻译。
 */
export type PasteResult =
  | { ok: true }
  | { ok: false; reason: 'addon-unavailable'; detail: string }
  | { ok: false; reason: 'paste-failed'; detail: string }

export interface OrchestratorDeps {
  /** 拉取当前配好的 ASR provider；null = 未配置（onboarding 未完成或凭据缺失） */
  getProvider(): ASRProvider | null
  /**
   * 当 getProvider 返 null 时，orchestrator 拿这个 i18n key 透给 HUD。
   * 由 main/index.ts 从 registry 解析当前 providerId 的 missingCredentialsKey；
   * provider 未注册 / store 损坏时回退到通用 key。返回 key（非文案）。
   */
  getMissingCredentialsKey(): string
  hud: HudPort
  audio: AudioRendererPort
  /**
   * 把 final 文本注入当前焦点 app。
   * 返回 PasteResult —— 失败时 orchestrator 翻成 SESSION_ERROR 给 HUD，
   * 不再 console.warn 静默丢字（issue #60）。
   */
  paste(text: string): PasteResult
  /** session 终止（commit 完成 / abort 完成 / error 处理完）时回调 hotkey FSM 派发 SESSION_DONE */
  notifyHotkeyDone(): void
}
