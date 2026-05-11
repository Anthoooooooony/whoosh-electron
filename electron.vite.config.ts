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

  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: {
          audio: resolve(rootDir, 'src/renderers/audio/preload.ts'),
          hud: resolve(rootDir, 'src/renderers/hud/preload.ts'),
          settings: resolve(rootDir, 'src/renderers/settings/preload.ts'),
          onboarding: resolve(rootDir, 'src/renderers/onboarding/preload.ts'),
        },
      },
      outDir: resolve(rootDir, 'out/preload'),
    },
    resolve: {
      alias: {
        '@shared': resolve(rootDir, 'src/shared'),
      },
    },
  },

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
