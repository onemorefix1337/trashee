import { contextBridge, ipcRenderer } from 'electron'
import type { VoiceEvent } from '../shared/voice'

const voice = {
  /** The speech model, as downloaded; null when there is none. */
  modelBytes: (): Promise<Uint8Array | null> => ipcRenderer.invoke('voice:model'),
  report: (event: VoiceEvent): void => ipcRenderer.send('voice:report', event)
}

export type VoiceApi = typeof voice

contextBridge.exposeInMainWorld('voice', voice)
