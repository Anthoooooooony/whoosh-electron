/**
 * Conventional Commits — release-please 依赖这套规范驱动版本与 changelog
 *
 * 仅允许三种 type，与 release-please 的 bump 语义一一对应：
 *   feat:  新功能            → minor bump
 *   fix:   一切非新功能的代码改动（修 bug / 重构 / 性能 / 依赖 / 构建 / CI / 测试）→ patch bump
 *   docs:  纯文档与注释         → 不 bump
 *
 * 不再使用 chore / refactor / perf / test / ci / style / build / revert：
 * 它们要么因 release-please 默认不 bump 而违背"代码改动都发版"的约定，
 * 要么语义在本仓库里被吸收到 fix: 之中。
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'subject-case': [0],
    'type-enum': [2, 'always', ['feat', 'fix', 'docs']],
  },
}
