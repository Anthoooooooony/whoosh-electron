// Settings renderer · M11
//
// 5 个 section: Setup / Provider / Behavior / Logs & Privacy / About
// 通过 window.ipc.invoke 读写 main 进程的 store；M11 阶段不做 schema-driven form，
// 每个 section 手写组件即可。

import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import { Channels } from '@shared/ipc/channels.js'
import type { AppConfig } from '@shared/ipc/schemas.js'
import { initI18n } from '@shared/i18n/index.js'
import { triggerKeyLabel } from '@shared/trigger-key.js'
import {
  DoubaoStoreConfigSchema,
  type DoubaoStoreConfig,
} from '@shared/types/providers/doubao-config.js'
import { useAudioInputDevices, type DeviceInfo } from '../_shared/use-audio-devices.js'

initI18n()

/**
 * 把 `cfg.providers['doubao']`（record<string, unknown>）safeParse 成强类型子配置。
 * 替代过去散落的 `as string` 断言 —— schema 在 shared 端是单一来源。
 */
function readDoubaoCfg(cfg: AppConfig): DoubaoStoreConfig {
  const parsed = DoubaoStoreConfigSchema.safeParse(cfg.providers['doubao'] ?? {})
  return parsed.success ? parsed.data : {}
}

type SectionKey = 'setup' | 'provider' | 'behavior' | 'logs' | 'about'

function App(): React.ReactElement {
  const [section, setSection] = useState<SectionKey>('setup')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [apiKey, setApiKeyState] = useState<string>('')
  const { devices, refresh: refreshDevices } = useAudioInputDevices()

  /* 初始拉配置 */
  useEffect(() => {
    void (async () => {
      const cfg = await window.ipc.invoke(Channels.SETTINGS_GET)
      setConfig(cfg)
      const { key } = await window.ipc.invoke(Channels.SETTINGS_GET_APIKEY, {
        providerId: 'doubao',
      })
      setApiKeyState(key ?? '')
    })()
  }, [])

  const updateConfig = useCallback(async (patch: Partial<AppConfig>) => {
    const next = await window.ipc.invoke(Channels.SETTINGS_SET, patch)
    setConfig(next)
  }, [])

  const updateProviderConfig = useCallback(
    async (providerPatch: Record<string, unknown>) => {
      if (!config) return
      const merged = { ...(config.providers['doubao'] ?? {}), ...providerPatch }
      await updateConfig({ providers: { ...config.providers, doubao: merged } })
    },
    [config, updateConfig],
  )

  if (!config) {
    return <div style={{ padding: 40, color: 'var(--text-muted)' }}>加载中…</div>
  }

  return (
    <div className="app">
      <div className="titlebar-drag" />
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-name">
            whoosh<em>·</em>
          </div>
          <div className="sidebar-brand-ver mono">v0.1.0</div>
        </div>
        <div className="sidebar-section">配置</div>
        {(
          [
            ['setup', '基础'],
            ['provider', '服务商'],
            ['behavior', '行为'],
            ['logs', '日志与隐私'],
            ['about', '关于'],
          ] as const
        ).map(([key, label]) => (
          <div
            key={key}
            className={`sidebar-item${section === key ? ' active' : ''}`}
            onClick={() => setSection(key)}
          >
            {label}
          </div>
        ))}
        <div className="sidebar-footer">
          <span className="dot-listen" />
          <span>监听中 · {triggerKeyLabel(window.platform)}</span>
        </div>
      </aside>

      <main className="content">
        {section === 'setup' && (
          <SetupPane
            config={config}
            devices={devices}
            apiKey={apiKey}
            onApiKeyChange={setApiKeyState}
            updateConfig={updateConfig}
            refreshDevices={refreshDevices}
          />
        )}
        {section === 'provider' && (
          <ProviderPane
            providerCfg={config.providers['doubao'] ?? {}}
            updateProviderConfig={updateProviderConfig}
          />
        )}
        {section === 'behavior' && <BehaviorPane config={config} updateConfig={updateConfig} />}
        {section === 'logs' && <LogsPane config={config} updateConfig={updateConfig} />}
        {section === 'about' && <AboutPane />}
      </main>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   Setup pane —— mic 设备、API 凭据、权限状态
   ─────────────────────────────────────────────────────────── */
interface SetupPaneProps {
  config: AppConfig
  devices: DeviceInfo[]
  apiKey: string
  onApiKeyChange: (key: string) => void
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>
  refreshDevices: () => Promise<void>
}

function SetupPane(props: SetupPaneProps): React.ReactElement {
  const { config, devices, apiKey, onApiKeyChange, updateConfig, refreshDevices } = props
  const { t } = useTranslation()
  const [resourceId, setResourceId] = useState<string>(
    readDoubaoCfg(config).resourceId ?? 'volc.seedasr.sauc.duration',
  )
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    msg: string
    latency?: number
  } | null>(null)

  // 失败时把 reason 返回给调用方，让 testConnection 把测试结果覆盖成保存失败提示。
  // 不在这里 setTestResult —— 调用方还要根据成功 / 失败决定后续 resourceId 同步。
  const saveApiKey = useCallback(async (): Promise<
    { ok: true } | { ok: false; reason: 'encryption-unavailable' }
  > => {
    const res = await window.ipc.invoke(Channels.SETTINGS_SET_APIKEY, {
      providerId: 'doubao',
      key: apiKey,
    })
    if (!res.ok) return res
    await updateConfig({
      providers: {
        ...config.providers,
        doubao: { ...(config.providers['doubao'] ?? {}), resourceId },
      },
    })
    return { ok: true }
  }, [apiKey, resourceId, config, updateConfig])

  const testConnection = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.ipc.invoke(Channels.PROVIDER_TEST_CONNECTION, {
        providerId: 'doubao',
        credentials: { apiKey, resourceId },
      })
      const result = {
        ok: res.ok,
        msg: res.ok ? '连接成功' : (res.error ?? 'unknown error'),
      } as { ok: boolean; msg: string; latency?: number }
      if (res.latencyMs !== undefined) result.latency = res.latencyMs
      if (res.ok) {
        const saved = await saveApiKey()
        if (!saved.ok) {
          // 连接成功但本地没法安全保存 —— 用户看到的就是失败结果，不展示"已连接"假象。
          setTestResult({
            ok: false,
            msg: t('errors.safeStorageUnavailable'),
          })
          return
        }
      }
      setTestResult(result)
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }, [apiKey, resourceId, saveApiKey, t])

  return (
    <>
      <div className="pane-header">
        <div className="pane-eyebrow">— 配置 / 01</div>
        <h3 className="pane-title">基础</h3>
        <p className="pane-desc">麦克风设备、API 凭据与系统权限状态。</p>
      </div>

      <div className="group">
        <h4 className="group-title">麦克风</h4>
        <div className="card">
          <div className="row">
            <div className="row-info">
              <span className="row-label">输入设备</span>
              <span className="row-hint">默认跟随系统当前选择的输入设备。</span>
            </div>
            <div className="row-control">
              <select
                className="select-native"
                value={config.audio.inputDeviceId ?? ''}
                onChange={(e) => {
                  const id = e.target.value || null
                  const label = devices.find((d) => d.deviceId === id)?.label
                  const audio = { inputDeviceId: id, ...(label ? { inputDeviceLabel: label } : {}) }
                  void updateConfig({ audio })
                }}
              >
                <option value="">系统默认</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
              <button className="btn-accent" onClick={() => void refreshDevices()}>
                刷新
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="group">
        <h4 className="group-title">API 凭据 · 豆包</h4>
        <div className="card">
          <div className="field-stack">
            <div className="field">
              <label className="field-label">API Key</label>
              <input
                className="input field-input"
                type="password"
                placeholder="新版控制台 X-Api-Key（UUID 格式）"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">Resource ID</label>
              <select
                className="select-native field-input"
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
              >
                <option value="volc.seedasr.sauc.duration">
                  v2 小时版 · volc.seedasr.sauc.duration
                </option>
                <option value="volc.seedasr.sauc.concurrent">
                  v2 并发版 · volc.seedasr.sauc.concurrent
                </option>
                <option value="volc.bigasr.sauc.duration">
                  v1 小时版 · volc.bigasr.sauc.duration
                </option>
                <option value="volc.bigasr.sauc.concurrent">
                  v1 并发版 · volc.bigasr.sauc.concurrent
                </option>
              </select>
            </div>
          </div>
          <div className="test-bar">
            <div>
              {testResult ? (
                testResult.ok ? (
                  <>
                    <span className="status-pill status-success">已连接</span>
                    <span style={{ marginLeft: 10, color: 'var(--text-2)' }}>
                      {testResult.msg}
                      {testResult.latency !== undefined ? ` · ${testResult.latency}ms` : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="status-pill status-error">失败</span>
                    <span style={{ marginLeft: 10, color: 'var(--error)' }}>{testResult.msg}</span>
                  </>
                )
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>
                  填好凭据后点 Test Connection 验证 + 保存
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
      </div>
    </>
  )
}

/* ───────────────────────────────────────────────────────────
   Provider pane —— 豆包识别参数
   ─────────────────────────────────────────────────────────── */
interface ProviderPaneProps {
  providerCfg: Record<string, unknown>
  updateProviderConfig: (patch: Record<string, unknown>) => Promise<void>
}

function ProviderPane({
  providerCfg,
  updateProviderConfig,
}: ProviderPaneProps): React.ReactElement {
  // safeParse 落到强类型，避免散点 `as string` —— 字段缺省值与之前等价
  const parsed = DoubaoStoreConfigSchema.safeParse(providerCfg)
  const doubaoCfg: DoubaoStoreConfig = parsed.success ? parsed.data : {}
  const language = doubaoCfg.language ?? 'zh-CN'
  const endpointKey = doubaoCfg.endpointKey ?? 'bigmodel_async'
  const enableItn = doubaoCfg.enable_itn !== false
  const enablePunc = doubaoCfg.enable_punc !== false
  const enableDdc = doubaoCfg.enable_ddc === true
  const showUtterances = doubaoCfg.show_utterances === true

  return (
    <>
      <div className="pane-header">
        <div className="pane-eyebrow">— 配置 / 02</div>
        <h3 className="pane-title">服务商 · 豆包 Seed</h3>
        <p className="pane-desc">ASR 服务商相关设置。</p>
      </div>

      <div className="group">
        <h4 className="group-title">识别</h4>
        <div className="card">
          <div className="row">
            <div className="row-info">
              <span className="row-label">识别语言</span>
              <span className="row-hint">
                模型原生支持中英混合 code-switching，zh-CN 已覆盖大多数日常场景。
              </span>
            </div>
            <div className="row-control">
              <select
                className="select-native"
                value={language}
                onChange={(e) => void updateProviderConfig({ language: e.target.value })}
              >
                <option value="zh-CN">zh-CN · 中文（含中英混合）</option>
                <option value="en-US">en-US · 英文</option>
                <option value="ja-JP">ja-JP · 日语</option>
                <option value="ko-KR">ko-KR · 韩语</option>
                <option value="yue-CN">yue-CN · 粤语</option>
              </select>
            </div>
          </div>
          <div className="row">
            <div className="row-info">
              <span className="row-label">Endpoint 模式</span>
              <span className="row-hint">bigmodel_async = 双向流式优化版（推荐）</span>
            </div>
            <div className="row-control">
              <select
                className="select-native"
                value={endpointKey}
                onChange={(e) => void updateProviderConfig({ endpointKey: e.target.value })}
              >
                <option value="bigmodel_async">bigmodel_async（推荐）</option>
                <option value="bigmodel">bigmodel · 双向流式标准</option>
                <option value="bigmodel_nostream">bigmodel_nostream · 流式输入</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="group">
        <h4 className="group-title">后处理</h4>
        <div className="card">
          <div className="row">
            <div className="row-info">
              <span className="row-label">文本逆归一化（ITN）</span>
              <span className="row-hint">"一百二十三" → "123"</span>
            </div>
            <div className="row-control">
              <span
                className="toggle"
                data-on={enableItn}
                onClick={() => void updateProviderConfig({ enable_itn: !enableItn })}
              />
            </div>
          </div>
          <div className="row">
            <div className="row-info">
              <span className="row-label">自动标点</span>
              <span className="row-hint">在语义边界自动插入「，。？！」</span>
            </div>
            <div className="row-control">
              <span
                className="toggle"
                data-on={enablePunc}
                onClick={() => void updateProviderConfig({ enable_punc: !enablePunc })}
              />
            </div>
          </div>
          <div className="row">
            <div className="row-info">
              <span className="row-label">语义顺滑（DDC）</span>
              <span className="row-hint">删除"嗯""啊"等填充词，提升书面感</span>
            </div>
            <div className="row-control">
              <span
                className="toggle"
                data-on={enableDdc}
                onClick={() => void updateProviderConfig({ enable_ddc: !enableDdc })}
              />
            </div>
          </div>
          <div className="row">
            <div className="row-info">
              <span className="row-label">输出分句信息</span>
              <span className="row-hint">仅 debug 时开启；上层 UI 不消费</span>
            </div>
            <div className="row-control">
              <span
                className="toggle"
                data-on={showUtterances}
                onClick={() => void updateProviderConfig({ show_utterances: !showUtterances })}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ───────────────────────────────────────────────────────────
   Behavior pane —— 触发键 + 开机自启 + HUD 开关
   ─────────────────────────────────────────────────────────── */
interface BehaviorPaneProps {
  config: AppConfig
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>
}

function BehaviorPane({ config, updateConfig }: BehaviorPaneProps): React.ReactElement {
  return (
    <>
      <div className="pane-header">
        <div className="pane-eyebrow">— 配置 / 03</div>
        <h3 className="pane-title">行为</h3>
        <p className="pane-desc">触发键与启动行为。</p>
      </div>

      <div className="group">
        <h4 className="group-title">触发</h4>
        <div className="card">
          <div className="row">
            <div className="row-info">
              <span className="row-label">快捷键</span>
              <span className="row-hint">长按录音，松开完成。当前版本不支持自定义。</span>
            </div>
            <div className="row-control">
              <span className="kbd">{window.platform === 'darwin' ? '⌥' : 'Ctrl'}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {triggerKeyLabel(window.platform)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="group">
        <h4 className="group-title">启动</h4>
        <div className="card">
          <div className="row">
            <div className="row-info">
              <span className="row-label">开机自启</span>
              <span className="row-hint">系统启动时自动后台运行 whoosh。</span>
            </div>
            <div className="row-control">
              <span
                className="toggle"
                data-on={config.behavior.openAtLogin}
                onClick={() =>
                  void updateConfig({
                    behavior: {
                      ...config.behavior,
                      openAtLogin: !config.behavior.openAtLogin,
                    },
                  })
                }
              />
            </div>
          </div>
          <div className="row">
            <div className="row-info">
              <span className="row-label">录音时显示 HUD</span>
              <span className="row-hint">关闭后录音过程将无任何屏幕反馈。</span>
            </div>
            <div className="row-control">
              <span
                className="toggle"
                data-on={config.behavior.showHudWhenRecording}
                onClick={() =>
                  void updateConfig({
                    behavior: {
                      ...config.behavior,
                      showHudWhenRecording: !config.behavior.showHudWhenRecording,
                    },
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ───────────────────────────────────────────────────────────
   Logs & Privacy pane
   ─────────────────────────────────────────────────────────── */
interface LogsPaneProps {
  config: AppConfig
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>
}

function LogsPane({ config, updateConfig }: LogsPaneProps): React.ReactElement {
  return (
    <>
      <div className="pane-header">
        <div className="pane-eyebrow">— 配置 / 04</div>
        <h3 className="pane-title">日志与隐私</h3>
        <p className="pane-desc">whoosh 不上传任何遥测、不上报崩溃。日志仅本地保存。</p>
      </div>

      <div className="group">
        <h4 className="group-title">诊断</h4>
        <div className="card">
          <div className="row">
            <div className="row-info">
              <span className="row-label">详细日志</span>
              <span className="row-hint" style={{ color: 'var(--warn)' }}>
                ⚠ 会包含转录文本以便 debug —— 仅在复现问题时开启。
              </span>
            </div>
            <div className="row-control">
              <span
                className="toggle"
                data-on={config.logging.verbose}
                onClick={() =>
                  void updateConfig({
                    logging: { ...config.logging, verbose: !config.logging.verbose },
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div className="group">
        <h4 className="group-title">隐私</h4>
        <div className="card">
          <div className="row">
            <div className="row-info">
              <span className="row-label">遥测</span>
              <span className="row-hint">不会收集任何使用数据。</span>
            </div>
            <span className="status-pill status-success">已关闭</span>
          </div>
          <div className="row">
            <div className="row-info">
              <span className="row-label">崩溃上报</span>
              <span className="row-hint">无远程上报端点。报告 bug 时手动附上日志。</span>
            </div>
            <span className="status-pill status-success">已关闭</span>
          </div>
          <div className="row">
            <div className="row-info">
              <span className="row-label">剪贴板保护</span>
              <span className="row-hint">
                写入时附带 ConcealedType / TransientType 标记，不进剪贴板历史。
              </span>
            </div>
            <span className="status-pill status-success">已启用</span>
          </div>
        </div>
      </div>
    </>
  )
}

/* ───────────────────────────────────────────────────────────
   About pane
   ─────────────────────────────────────────────────────────── */
function AboutPane(): React.ReactElement {
  const [checking, setChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{
    hasUpdate: boolean
    version?: string
    url?: string
  } | null>(null)

  const checkUpdate = useCallback(async () => {
    setChecking(true)
    try {
      const res = await window.ipc.invoke(Channels.UPDATER_CHECK)
      const info: { hasUpdate: boolean; version?: string; url?: string } = {
        hasUpdate: res.hasUpdate,
      }
      if (res.version) info.version = res.version
      if (res.url) info.url = res.url
      setUpdateInfo(info)
    } finally {
      setChecking(false)
    }
  }, [])

  return (
    <>
      <div className="pane-header">
        <div className="pane-eyebrow">— 配置 / 05</div>
        <h3 className="pane-title">关于</h3>
        <p className="pane-desc">版本与更新检查。</p>
      </div>

      <div className="group">
        <div className="card">
          <div className="about-grid">
            <span className="about-key">版本</span>
            <span className="about-val mono">0.1.0 · macOS arm64</span>
            <span className="about-key">源码</span>
            <span className="about-val mono">
              <a
                href="https://github.com/Anthoooooooony/whoosh-electron"
                onClick={(e) => {
                  // M15 接 shell.openExternal 后再真正跳浏览器；在此之前先拦掉，避免导航走 settings 窗口
                  e.preventDefault()
                }}
              >
                github.com/Anthoooooooony/whoosh-electron
              </a>
            </span>
            <span className="about-key">许可证</span>
            <span className="about-val">私有 · 仅个人使用</span>
          </div>
        </div>
      </div>

      <div className="group">
        <button className="btn btn-primary" disabled={checking} onClick={() => void checkUpdate()}>
          {checking ? '检查中…' : '检查更新'}
        </button>
        {updateInfo && (
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-2)' }}>
            {updateInfo.hasUpdate ? `有新版本 ${updateInfo.version ?? ''}` : '当前已是最新版本'}
          </p>
        )}
      </div>
    </>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
console.info('[settings] renderer booted')
