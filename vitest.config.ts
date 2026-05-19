import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const rootDir = import.meta.dirname

const sharedAlias = {
  '@shared': resolve(rootDir, 'src/shared'),
  '@main': resolve(rootDir, 'src/main'),
  '@providers': resolve(rootDir, 'src/providers'),
  '@native': resolve(rootDir, 'src/native'),
  '@renderers': resolve(rootDir, 'src/renderers'),
}

// 拆 node / dom 两个 project：
//   - node：main / providers / shared / native 以及 renderer 下的纯逻辑 `.test.ts`
//     （例如 audio worklet 的 resampler、track-watch 这类不碰 DOM 的工具）
//   - dom：renderer 的 `.test.tsx` —— RTL + happy-dom，附带 mock window.ipc / i18n
//
// include 用扩展名严格分流（node 只匹配 .ts，dom 只匹配 .tsx），避免一个文件被两组都跑。
//
// coverage 在 root 级（projects 自动继承）—— baseline 阶段不设 thresholds，
// 只跑 `pnpm test:coverage` 时按需收集。
export default defineConfig({
  resolve: { alias: sharedAlias },
  test: {
    globals: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          include: ['src/renderers/**/*.test.tsx'],
          environment: 'happy-dom',
          setupFiles: ['./src/renderers/_shared/test-setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/native/**',
        'src/renderers/**/main.tsx',
        'src/renderers/**/preload.ts',
        'src/main/index.ts',
      ],
      // baseline 阶段：不设 thresholds，先收集数据
    },
  },
})
