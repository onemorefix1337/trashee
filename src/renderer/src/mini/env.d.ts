import type { MiniApi } from '../../../preload/mini'

declare global {
  interface Window {
    mini: MiniApi
  }
}

export {}
