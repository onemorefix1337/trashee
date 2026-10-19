import { execSync } from 'node:child_process'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** Short commit of this build, so a bug report can say exactly which one it is about. */
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  main: {
    define: {
      __BUILD_COMMIT__: JSON.stringify(commit()),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString())
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          mini: resolve('src/preload/mini.ts'),
          voice: resolve('src/preload/voice.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          mini: resolve('src/renderer/mini.html'),
          voice: resolve('src/renderer/voice.html')
        }
      }
    }
  }
})
