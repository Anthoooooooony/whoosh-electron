// Onboarding renderer · M12
//
// 4 步：API 凭据 → 麦克风权限 → Accessibility 权限（仅 macOS）→ 试用
// Windows 跳过 Step 3，进度条变 3 段。
//
// 完成判定 + 持久化：每步完成时调 onboarding:complete-step，主进程把
// completedSteps[] 写回 store。最后一步完成后发 onboarding:done，主进程切
// 到 Settings 窗口。

import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { Channels } from '@shared/ipc/channels.js'
import { initI18n } from '@shared/i18n/index.js'
import { triggerKeyLabel, type Platform } from '@shared/trigger-key.js'
import { DoubaoStoreConfigSchema } from '@shared/types/providers/doubao-config.js'
import { useAudioInputDevices } from '../_shared/use-audio-devices.js'

initI18n()

interface OnboardingState {
  currentStep: 1 | 2 | 3 | 4
  platform: Platform
}

function App(): React.ReactElement {
  const [state, setState] = useState<OnboardingState | null>(null)

  useEffect(() => {
    void (async () => {
      const { step, platform } = await window.ipc.invoke(Channels.ONBOARDING_GET_STEP)
      setState({ currentStep: step, platform })
    })()
  }, [])

  const goToStep = useCallback((step: 1 | 2 | 3 | 4) => {
    setState((s) => (s ? { ...s, currentStep: step } : s))
  }, [])

  const completeStep = useCallback(
    async (step: 1 | 2 | 3 | 4) => {
      const { nextStep } = await window.ipc.invoke(Channels.ONBOARDING_COMPLETE_STEP, { step })
      if (nextStep === null) {
        // 全部完成
        window.ipc.send(Channels.ONBOARDING_DONE)
      } else {
        goToStep(nextStep)
      }
    },
    [goToStep],
  )

  if (!state) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>加载中…</div>

  const stepsForPlatform: (1 | 2 | 3 | 4)[] = state.platform === 'darwin' ? [1, 2, 3, 4] : [1, 2, 4]
  const stepIndex = stepsForPlatform.indexOf(state.currentStep)
  const totalSteps = stepsForPlatform.length

  return (
    <div className="onb-body">
      <div className="titlebar-drag" />
      <ProgressBar total={totalSteps} currentIndex={stepIndex} />

      {state.currentStep === 1 && <Step1Credentials onComplete={() => void completeStep(1)} />}
      {state.currentStep === 2 && (
        <Step2Microphone onComplete={() => void completeStep(2)} onBack={() => goToStep(1)} />
      )}
      {state.currentStep === 3 && state.platform === 'darwin' && (
        <Step3Accessibility onComplete={() => void completeStep(3)} onBack={() => goToStep(2)} />
      )}
      {state.currentStep === 4 && (
        <Step4Trial
          platform={state.platform}
          onComplete={() => void completeStep(4)}
          onBack={() => goToStep(state.platform === 'darwin' ? 3 : 2)}
        />
      )}

      <Footer stepIndex={stepIndex} totalSteps={totalSteps} />
    </div>
  )
}

function ProgressBar({
  total,
  currentIndex,
}: {
  total: number
  currentIndex: number
}): React.ReactElement {
  return (
    <div className="onb-progress">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="onb-progress-seg"
          data-status={i < currentIndex ? 'done' : i === currentIndex ? 'active' : undefined}
        />
      ))}
    </div>
  )
}

function Footer({
  stepIndex,
  totalSteps,
}: {
  stepIndex: number
  totalSteps: number
}): React.ReactElement {
  return (
    <div className="onb-step-counter" style={{ marginTop: 'auto', paddingTop: 24 }}>
      <strong>{stepIndex + 1}</strong> / {totalSteps}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   Step 1: Credentials
   ─────────────────────────────────────────────────────────── */
function Step1Credentials({ onComplete }: { onComplete: () => void }): React.ReactElement {
  const { t } = useTranslation()
  const [apiKey, setApiKey] = useState('')
  const [resourceId, setResourceId] = useState('volc.seedasr.sauc.duration')
  const [testing, setTesting] = useState(false)
  const [testOk, setTestOk] = useState<boolean | null>(null)
  const [testMsg, setTestMsg] = useState('')

  useEffect(() => {
    void (async () => {
      const { key } = await window.ipc.invoke(Channels.SETTINGS_GET_APIKEY, {
        providerId: 'doubao',
      })
      if (key) setApiKey(key)
      const cfg = await window.ipc.invoke(Channels.SETTINGS_GET)
      // safeParse 落到强类型，去掉过去的 `as string` 断言
      const parsed = DoubaoStoreConfigSchema.safeParse(cfg.providers['doubao'] ?? {})
      const stored = parsed.success ? parsed.data.resourceId : null
      if (stored) setResourceId(stored)
    })()
  }, [])

  const testConnection = useCallback(async () => {
    setTesting(true)
    setTestOk(null)
    try {
      const res = await window.ipc.invoke(Channels.PROVIDER_TEST_CONNECTION, {
        providerId: 'doubao',
        credentials: { apiKey, resourceId },
      })
      if (res.ok) {
        // 保存 —— safeStorage 不可用时 main 端拒绝写入，需把失败反映到 UI 上，
        // 否则用户点了"已连接"但密钥根本没落盘，下一次启动直接进不了 ASR。
        const saveRes = await window.ipc.invoke(Channels.SETTINGS_SET_APIKEY, {
          providerId: 'doubao',
          key: apiKey,
        })
        if (!saveRes.ok) {
          setTestOk(false)
          setTestMsg(t('errors.safeStorageUnavailable'))
          return
        }
        const cfg = await window.ipc.invoke(Channels.SETTINGS_GET)
        await window.ipc.invoke(Channels.SETTINGS_SET, {
          providers: {
            ...cfg.providers,
            doubao: { ...(cfg.providers['doubao'] ?? {}), resourceId },
          },
        })
      }
      setTestOk(res.ok)
      setTestMsg(res.ok ? `连接成功 · ${res.latencyMs ?? 0}ms` : (res.error ?? 'unknown error'))
    } catch (err) {
      setTestOk(false)
      setTestMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }, [apiKey, resourceId, t])

  return (
    <>
      <span className="onb-step-no">第 01 步 · 凭据</span>
      <h3 className="onb-title">
        连接到 <em>豆包·Seed ASR</em>
      </h3>
      <p className="onb-desc">
        在火山引擎控制台「服务管理 → 流式语音识别 2.0」找到对应字段。API Key 仅本机 safeStorage
        加密保存，不会上传。
      </p>

      <div className="onb-content">
        <div className="field-group">
          <label className="field-label">API Key</label>
          <input
            className="field-input"
            type="password"
            placeholder="新版控制台 X-Api-Key（UUID 格式）"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Resource ID</label>
          <select
            className="field-input"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
          >
            <option value="volc.seedasr.sauc.duration">
              v2 小时版 · volc.seedasr.sauc.duration
            </option>
            <option value="volc.seedasr.sauc.concurrent">
              v2 并发版 · volc.seedasr.sauc.concurrent
            </option>
            <option value="volc.bigasr.sauc.duration">v1 小时版 · volc.bigasr.sauc.duration</option>
            <option value="volc.bigasr.sauc.concurrent">
              v1 并发版 · volc.bigasr.sauc.concurrent
            </option>
          </select>
        </div>

        <div className="test-bar">
          <div>
            {testOk === true && (
              <>
                <span className="status-pill status-success">已验证</span>
                <span style={{ marginLeft: 10 }}>{testMsg}</span>
              </>
            )}
            {testOk === false && (
              <>
                <span className="status-pill status-error">失败</span>
                <span style={{ marginLeft: 10, color: 'var(--error)' }}>{testMsg}</span>
              </>
            )}
            {testOk === null && (
              <span style={{ color: 'var(--text-muted)' }}>
                点 Test Connection 验证连通后即可继续
              </span>
            )}
          </div>
          <button
            className="btn btn-primary"
            disabled={testing || !apiKey}
            onClick={() => void testConnection()}
          >
            {testing ? '测试中…' : 'Test Connection'}
          </button>
        </div>
      </div>

      <div className="onb-footer">
        <div />
        <div className="onb-buttons">
          <button className="btn btn-primary" disabled={testOk !== true} onClick={onComplete}>
            继续 →
          </button>
        </div>
      </div>
    </>
  )
}

/* ───────────────────────────────────────────────────────────
   Step 2: Microphone permission
   ─────────────────────────────────────────────────────────── */
function Step2Microphone({
  onComplete,
  onBack,
}: {
  onComplete: () => void
  onBack: () => void
}): React.ReactElement {
  const [status, setStatus] = useState<'idle' | 'granted' | 'denied'>('idle')

  useEffect(() => {
    void (async () => {
      const { mic } = await window.ipc.invoke(Channels.PERMISSION_STATUS)
      if (mic) setStatus('granted')
    })()
  }, [])

  const grant = useCallback(async () => {
    const res = await window.ipc.invoke(Channels.PERMISSION_REQUEST_MIC)
    setStatus(res.granted ? 'granted' : 'denied')
  }, [])

  return (
    <>
      <span className="onb-step-no">第 02 步 · 麦克风</span>
      <h3 className="onb-title">
        允许 whoosh 访问<em>麦克风</em>
      </h3>
      <p className="onb-desc">
        录音数据仅作为 ASR 流的输入，不会本地缓存（除非手动开启 Verbose
        logging），不会上传到豆包之外的任何服务器。
      </p>

      <div className="onb-content">
        <div className="perm-row">
          <div className="perm-info">
            <span className="perm-name">麦克风访问</span>
            <span className="perm-hint">点击"Grant"会触发系统弹窗一次。</span>
          </div>
          {status === 'granted' && <span className="status-pill status-success">已授权</span>}
          {status === 'denied' && <span className="status-pill status-error">被拒绝</span>}
          {status === 'idle' && <span className="status-pill status-idle">未授权</span>}
        </div>
        {status === 'denied' && (
          <div className="warn-callout">
            被拒绝；可手动在「系统设置 → 隐私与安全 → 麦克风」开启 Electron 权限再回来继续。
          </div>
        )}
      </div>

      <div className="onb-footer">
        <button className="btn btn-secondary" onClick={onBack}>
          ← 返回
        </button>
        <div className="onb-buttons">
          {status !== 'granted' && (
            <button className="btn btn-primary" onClick={() => void grant()}>
              授予访问权限
            </button>
          )}
          {status === 'granted' && (
            <button className="btn btn-primary" onClick={onComplete}>
              继续 →
            </button>
          )}
        </div>
      </div>
    </>
  )
}

/* ───────────────────────────────────────────────────────────
   Step 3: Accessibility (macOS only)
   ─────────────────────────────────────────────────────────── */
function Step3Accessibility({
  onComplete,
  onBack,
}: {
  onComplete: () => void
  onBack: () => void
}): React.ReactElement {
  const [granted, setGranted] = useState(false)

  useEffect(() => {
    const tick = setInterval(async () => {
      const res = await window.ipc.invoke(Channels.PERMISSION_STATUS)
      if (res.accessibility === true) setGranted(true)
    }, 1500)
    return () => clearInterval(tick)
  }, [])

  const openPrefs = useCallback(() => {
    window.ipc.send(Channels.PERMISSION_OPEN_SYSTEM_PREFS, { pane: 'accessibility' })
  }, [])

  return (
    <>
      <span className="onb-step-no">第 03 步 · 辅助功能（仅 macOS）</span>
      <h3 className="onb-title">
        允许全局快捷键与<em>键盘注入</em>
      </h3>
      <p className="onb-desc">
        macOS 需要在「系统设置 → 隐私与安全 → 辅助功能」勾选 whoosh，用于：监听全局右 Option
        触发键、模拟 ⌘V 把识别文本粘贴到当前 app。
      </p>

      <div className="onb-content">
        <div className="perm-row">
          <div className="perm-info">
            <span className="perm-name">辅助功能访问</span>
            <span className="perm-hint">
              点「Open System Settings」跳转 → 勾选 whoosh →
              系统会询问是否「退出并重新打开」，确认后继续
            </span>
          </div>
          {granted ? (
            <span className="status-pill status-success">已授权</span>
          ) : (
            <span className="status-pill status-idle">未授权</span>
          )}
        </div>
        <div className="warn-callout">
          授权后 macOS 会提示「退出并重新打开」whoosh，确认后键盘 listener
          自动加载，回到本步骤后即可继续。
        </div>
      </div>

      <div className="onb-footer">
        <button className="btn btn-secondary" onClick={onBack}>
          ← 返回
        </button>
        <div className="onb-buttons">
          <button className="btn btn-secondary" onClick={openPrefs}>
            Open System Settings
          </button>
          <button className="btn btn-primary" disabled={!granted} onClick={onComplete}>
            {granted ? '下一步' : '等待授权…'}
          </button>
        </div>
      </div>
    </>
  )
}

/* ───────────────────────────────────────────────────────────
   Step 4: Trial
   ─────────────────────────────────────────────────────────── */
function Step4Trial({
  platform,
  onComplete,
  onBack,
}: {
  platform: Platform
  onComplete: () => void
  onBack: () => void
}): React.ReactElement {
  const [text, setText] = useState('')
  const { devices } = useAudioInputDevices()
  const [deviceId, setDeviceId] = useState<string>('')

  useEffect(() => {
    void (async () => {
      const cfg = await window.ipc.invoke(Channels.SETTINGS_GET)
      setDeviceId(cfg?.audio?.inputDeviceId ?? '')
    })()
  }, [])

  const onDeviceChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value
      setDeviceId(id)
      const label = devices.find((d) => d.deviceId === id)?.label
      await window.ipc.invoke(Channels.SETTINGS_SET, {
        audio: {
          inputDeviceId: id || null,
          ...(label ? { inputDeviceLabel: label } : {}),
        },
      })
    },
    [devices],
  )

  return (
    <>
      <span className="onb-step-no">第 04 步 · 试用</span>
      <h3 className="onb-title">
        说一句，或<em>敲</em>一句
      </h3>
      <p className="onb-desc">
        按住{triggerKeyLabel(platform)}说话试试，或直接键盘输入。任意非空文本即可完成首次设置。
      </p>

      <div className="onb-content">
        <label className="field-label" htmlFor="onb-mic">
          麦克风
        </label>
        <select
          id="onb-mic"
          className="field-select"
          value={deviceId}
          onChange={(e) => void onDeviceChange(e)}
          style={{ marginBottom: 16 }}
        >
          <option value="">系统默认</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
        <textarea
          className="field-textarea"
          placeholder={`按住${triggerKeyLabel(platform)}说话，松开后文字会粘到这里 · 或直接键入`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          已输入 {text.length} 字
        </p>
      </div>

      <div className="onb-footer">
        <button className="btn btn-secondary" onClick={onBack}>
          ← 返回
        </button>
        <div className="onb-buttons">
          <button
            className="btn btn-primary"
            disabled={text.trim().length === 0}
            onClick={onComplete}
          >
            完成设置 ✓
          </button>
        </div>
      </div>
    </>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
console.info('[onboarding] renderer booted')
