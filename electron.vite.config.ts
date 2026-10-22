import { execSync } from 'node:child_process'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

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

/**
 * onnxruntime-web is always handed its runtime as bytes (downloaded with the voice model, only by those who turn
 * the voice check on), so the 14 MB file it would otherwise load from next to itself must not be copied into the
 * app. Its fallback path is pointed somewhere the bundler does not treat as a file to copy.
 */
const ortRuntimeNotBundled: Plugin = {
  name: 'trashee-ort-runtime-not-bundled',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('onnxruntime-web')) return null
    const pattern = 'new URL("ort-wasm-simd-threaded.wasm",import.meta.url)'
    if (!code.includes(pattern)) return null
    return {
      code: code.replaceAll(pattern, 'new URL("ort-wasm-simd-threaded.wasm","file:///")'),
      map: null
    }
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
    plugins: [react(), ortRuntimeNotBundled],
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
