# whoosh-electron · 项目协作规范

跨平台 AI 语音输入法。按住右 Option / 右 Alt 录音，松开后流式 ASR 出文本，一次性粘贴到当前聚焦 app。

历史设计快照（视觉 mock、M1→M16 实施蓝图）见 `archive/`。

---

## Commit 与版本

- **必须**使用 [Conventional Commits](https://www.conventionalcommits.org)，由 `commitlint` 强制；不通过的 commit 会在 `commit-msg` hook 被拒
- 版本号与 `CHANGELOG.md` 由 `release-please` 自动生成 —— 不要手动改 `package.json` 里的 `version`
- `feat:` / `fix:` 触发版本 bump；`chore:` / `docs:` / `refactor:` 等不 bump

## TypeScript

- 整库 `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride`
- `verbatimModuleSyntax` 开启 —— `import type` / `export type` 必须显式区分
- Path alias：`@main/*`、`@renderers/*`、`@shared/*`、`@providers/*`、`@native/*`

## 代码风格

- ESLint flat config (`eslint.config.js`)；Prettier 接管所有格式化（`eslint-config-prettier` 已禁用 ESLint 的格式规则）
- pre-commit hook 走 lint-staged：仅 lint + format 改动文件
- 注释语言：项目特定意图用中文（业务逻辑、设计动机），技术术语用英文（API、库名、协议字段）
- 不写废话注释 —— well-named identifiers 已经说明了 what，注释只写非显然的 why

## i18n

- 默认 UI 语言 zh-CN；保留 i18n framework（`react-i18next`）支持后续切换
- **所有用户可见字符串**走 `t('key')`，不允许硬编码
- 资源文件：`src/shared/locales/{zh-CN,en}.json`
- ASR 识别语言与 UI 语言独立设置（一个用户可以英文 UI + 中文识别）

## IPC

- channel 名集中定义在 `src/shared/ipc/channels.ts`，命名空间分组：`audio:*` / `session:*` / `hud:*` / `settings:*` / `provider:*` / `onboarding:*` / `permission:*` / `updater:*`
- 所有 payload 用 `zod` schema 双端运行时校验，schema 在 `src/shared/ipc/schemas.ts` 单一来源
- TypeScript 类型从 schema `z.infer` 推导，不重复定义

## Provider 抽象

- 新 provider 必须实现 `src/shared/types/provider.ts` 的 `ASRProvider` interface
- Provider 独有字段（language / model / hotwords 等）放 `settingsSchema`，**不要**污染上层接口
- 音频输入统一 16kHz mono s16le PCM；provider 内部按需转码到自家协议
- 目前仅落地豆包 provider，但抽象层完整可扩展；UI 上 provider dropdown 暂藏

## 隐私

- 默认 `info` 级别日志**绝对不**记录转录文本（用户的语音内容）
- `debug` 级允许记转录，但必须由用户主动在设置里开启 "详细日志" toggle
- 零远程上报 —— 无 Sentry、无 telemetry、无 analytics
- 剪贴板写入附带 `org.nspasteboard.ConcealedType`（macOS）和 `ExcludeClipboardContentFromMonitorProcessing`（Windows）标记，不入剪贴板管理器历史

## 跨平台

- macOS：menubar icon（`LSUIElement=true`），无 dock；Windows：systray icon，无 taskbar 入口
- 触发键：右 Option（macOS rawcode `0x3D`）/ 右 Alt（Windows `VK_RMENU`）
- macOS 需 Accessibility 权限才能监听全局键盘 + 模拟粘贴；Windows 无此权限要求
- Onboarding 在 Windows 上跳过 Step 3（Accessibility），从 4 步变 3 步
- 路径 label：`~/Library/Logs/whoosh/main.log` (macOS) / `%APPDATA%\whoosh\logs\main.log` (Windows)

## 构建与发布

- 包管理器：**pnpm**（`package.json` 锁到 `pnpm@11.0.9`；`.npmrc` 强制 `engine-strict`）
- 打包：electron-vite (dev) + electron-builder (installer)
- Native paste addon 用 node-gyp，CI 出 prebuilt `.node`，跟 app 一起打进安装包
- 分发：GitHub Releases，**不签名、不公证**（自用规模）
- 更新机制：被动检查 + tray 菜单提示，不自动下载

## Agent skills

### Issue tracker

GitHub Issues via `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical defaults (no rename). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
