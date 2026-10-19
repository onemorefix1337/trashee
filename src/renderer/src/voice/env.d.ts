import type { VoiceApi } from '../../../preload/voice'

declare global {
  interface Window {
    voice: VoiceApi
  }
}
