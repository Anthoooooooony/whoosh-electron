import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'out',
      'release',
      'node_modules',
      'archive',
      'src/native/**/build',
      'src/native/prebuilds',
      '*.config.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 提升到 error —— `any` 关闭所有类型校验，比 missing import 还危险。
      // 真正必须 escape hatch 的位置（如 provider registry 的存储面）
      // 用 file-local eslint-disable-next-line 配 JSDoc 解释，让审计可追溯。
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
)
