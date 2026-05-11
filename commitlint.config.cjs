/**
 * Conventional Commits — release-please 依赖这套规范驱动版本与 changelog
 *   feat:     新功能
 *   fix:      bug 修复
 *   chore:    构建/工具/杂项
 *   docs:     文档
 *   refactor: 重构（无行为变化）
 *   test:     测试
 *   ci:       CI 配置
 *   perf:     性能
 *   style:    格式化
 *   build:    构建系统
 *   revert:   回滚
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'subject-case': [0],
  },
}
