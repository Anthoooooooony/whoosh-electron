import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const rootDir = import.meta.dirname

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: resolve(rootDir, 'src/main/index.ts'),
      },
      outDir: 'out/main',
    },
    resolve: {
      alias: {
        '@main': resolve(rootDir, 'src/main'),
        '@shared': resolve(rootDir, 'src/shared'),
        '@providers': resolve(rootDir, 'src/providers'),
        '@native': resolve(rootDir, 'src/native'),
      },
    },
  },

  // preload 在 M3（IPC 框架）落地，M2 暂不配

  renderer: {
    root: resolve(rootDir, 'src/renderers'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          audio: resolve(rootDir, 'src/renderers/audio/index.html'),
          hud: resolve(rootDir, 'src/renderers/hud/index.html'),
          settings: resolve(rootDir, 'src/renderers/settings/index.html'),
          onboarding: resolve(rootDir, 'src/renderers/onboarding/index.html'),
        },
      },
      outDir: resolve(rootDir, 'out/renderer'),
      emptyOutDir: true,
    },
    resolve: {
      alias: {
        '@renderers': resolve(rootDir, 'src/renderers'),
        '@shared': resolve(rootDir, 'src/shared'),
      },
    },
  },
})
