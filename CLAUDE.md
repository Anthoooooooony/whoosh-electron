# whoosh-electron · 项目协作规范

跨平台 AI 语音输入法。按住右 Option / 右 Alt 录音，松开后流式 ASR 出文本，一次性粘贴到当前聚焦 app。

已发布到 v0.2.3，自用产品形态稳定。历史设计快照（M1→M16 实施蓝图、原始视觉 mock）见 `archive/`。

---

## 工作流

主线：**Issue → Triage → 实现 → PR → 自动发版**。

1. **Issue 起点** —— 一切需求 / bug / 想法先成 GitHub Issue（走 `to-issues` skill 或 `gh issue create`）。新 issue 默认 `needs-triage`
2. **Triage** —— `triage` skill 把 `needs-triage` 移到下游 5 态之一：`needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。完整 label 语义见 `docs/agents/triage-labels.md`
3. **实现** —— `ready-for-agent` 由 AI 独立开 PR；`ready-for-human` 由人来。两者都必须：
   - 用 Conventional Commits（commit-msg hook 把关）
   - 推前本地 `pnpm typecheck && pnpm lint && pnpm test`
   - 涉及领域语义/架构决策时，看 `docs/agents/domain.md` 是否引导你去读 `CONTEXT.md` / `docs/adr/`
4. **PR + CI** —— 任何 PR 必跑 `.github/workflows/ci.yml`（typecheck / lint / format / vitest）。branch protection 强制绿才能 merge
5. **release-please** —— main 上每次 push 都触发 release-please.yml：累积 `feat:` / `fix:` commits 维护一个待发的 release PR
6. **发版** —— merge 那个 release PR → 自动 tag + 自动建 GitHub Release + 自动 dispatch release.yml 出 DMG（macOS arm64）+ NSIS exe（Windows x64）挂上去
7. **上线** —— 已发布 app 内 updater 每 6h 查一次 GitHub Releases，tray 菜单角标提示用户

外部资源引用约定见文末「Agent skills」节。

---

## Commit 与版本

- **必须**使用 [Conventional Commits](https://www.conventionalcommits.org)，由 `commitlint` 强制；不通过的 commit 会在 `commit-msg` hook 被拒
- 版本号与 `CHANGELOG.md` 由 `release-please` 自动生成 —— 不要手动改 `package.json` 里的 `version`
- **仅允许三种 type**（commitlint 在本仓库收窄了 `@commitlint/config-conventional` 的默认枚举）：
  - `feat:` 新功能 → minor bump
  - `fix:` 一切非新功能的代码改动（修 bug / 重构 / 性能 / 依赖 / 构建 / CI / 测试 / 工具配置）→ patch bump
  - `docs:` 纯文档与注释（README / `docs/` / 内嵌注释）→ 不 bump
- 不再使用 `chore` / `refactor` / `perf` / `test` / `ci` / `style` / `build` / `revert` —— 这些在 release-please 默认下不 bump，与"代码改动均发版"的本仓约定冲突
- **dependabot 例外**：dependabot 自动 PR 仍会带 `chore(deps):` —— 不要直接 merge，按 PR #33 的流程 cherry-pick 改写成 `fix(deps): ...` 再发新 PR，让 release-please 接得到

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

### 自动发版链路

GitHub Actions 全自动，不要手动改版本号、手动打 tag、手动跑 release.yml：

- `release-please.yml`（main push 触发）—— 维护下一个版本的 release PR；若该轮真的发了 release，主动 `gh workflow run release.yml --ref v$TAG`
- `release.yml`（`push: tags` 或 `workflow_dispatch` 触发）—— macOS arm64 + Windows x64 双矩阵 build，artifacts 经 `softprops/action-gh-release@v2` 上传到对应 Release
- `ci.yml` 同时支持 `workflow_dispatch` —— release-please.yml 会在新建/更新 release PR 时显式 dispatch 给它跑，绕过 GITHUB_TOKEN 递归锁

历史经验：CI 与 release.yml 都装了 `setup-node@v4` → `corepack prepare pnpm@11.0.9` → `setup-node@v4(cache: pnpm)` 三步走，绕开 pnpm/action-setup 在 runner 自带 Node 20 上的引擎不兼容；`@electron/get` 经 pnpm overrides 锁到 `^3.1.0` 解决 electron-builder 26.x 的枚举缺失。

## Agent skills

外部 skill（mattpocock 系：`to-issues` / `triage` / `to-prd` / `qa` / `improve-codebase-architecture` / `diagnose` / `tdd` / `grill-with-docs`）通过下面三个文件理解本仓约定：

- **Issue tracker** —— GitHub Issues + `gh` CLI。详见 `docs/agents/issue-tracker.md`
- **Triage labels** —— 5 态状态机：`needs-triage` → (`needs-info` | `ready-for-agent` | `ready-for-human` | `wontfix`)。映射表见 `docs/agents/triage-labels.md`，所有 label 保持 canonical 名（未重命名）
- **Domain docs** —— 单上下文：根目录 `CONTEXT.md`（领域词汇表）+ `docs/adr/`（架构决策记录）。详见 `docs/agents/domain.md`

**重要的 lazy 语义**：`CONTEXT.md` 与 `docs/adr/` 当前都不存在，这是预期状态。下游 skill 读不到时应**静默继续**，不要把缺失当 bug 报告；它们由 `grill-with-docs` 在「真有词汇需要锚定 / 真有决策需要记录」时按需创建。
