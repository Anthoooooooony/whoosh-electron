import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const rootDir = import.meta.dirname

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      '@shared': resolve(rootDir, 'src/shared'),
      '@main': resolve(rootDir, 'src/main'),
      '@providers': resolve(rootDir, 'src/providers'),
      '@native': resolve(rootDir, 'src/native'),
    },
  },
})
