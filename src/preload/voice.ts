import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { VoiceConfig, VoiceEvent } from '../shared/voice'

const voice = {
  config: (): Promise<VoiceConfig | null> => ipcRenderer.invoke('voice:get-config'),
  onConfig: (callback: (config: VoiceConfig) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, config: VoiceConfig): void => callback(config)
    ipcRenderer.on('voice:config', handler)
    return () => ipcRenderer.removeListener('voice:config', handler)
  },
  /** The speech model, as downloaded; null when there is none. */
  modelBytes: (): Promise<Uint8Array | null> => ipcRenderer.invoke('voice:model'),
  /** The voice model and the runtime that runs it; null until they are downloaded. */
  speakerPack: (): Promise<{ model: Uint8Array; runtime: Uint8Array } | null> =>
    ipcRenderer.invoke('voice:speaker-pack'),
  report: (event: VoiceEvent): void => ipcRenderer.send('voice:report', event)
}

export type VoiceApi = typeof voice

contextBridge.exposeInMainWorld('voice', voice)
