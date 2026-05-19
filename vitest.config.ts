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
  },
})
