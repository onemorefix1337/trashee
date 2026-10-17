import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  Account,
  Collection,
  CollectionRef,
  DeviceCode,
  Lyrics,
  Pin,
  PlaylistInfo,
  Quality,
  Restore,
  Track,
  WaveBatch,
  WaveEvent
} from '../shared/types'

const api = {
  platform: process.platform,
  restoreSession: (): Promise<Restore> => ipcRenderer.invoke('auth:restore'),
  copy: (text: string): Promise<void> => ipcRenderer.invoke('app:copy', text),
  login: (): Promise<Account> => ipcRenderer.invoke('auth:login'),
  cancelLogin: (): Promise<void> => ipcRenderer.invoke('auth:cancel'),
  logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
  onLoginCode: (callback: (code: DeviceCode) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, code: DeviceCode): void => callback(code)
    ipcRenderer.on('auth:code', handler)
    return () => ipcRenderer.removeListener('auth:code', handler)
  },

  search: (text: string): Promise<Track[]> => ipcRenderer.invoke('ym:search', text),
  liked: (): Promise<Track[]> => ipcRenderer.invoke('ym:liked'),
  likedIds: (): Promise<string[]> => ipcRenderer.invoke('ym:liked-ids'),
  setLike: (id: string, liked: boolean): Promise<void> =>
    ipcRenderer.invoke('ym:set-like', id, liked),
  setDislike: (id: string, disliked: boolean): Promise<void> =>
    ipcRenderer.invoke('ym:set-dislike', id, disliked),
  lyrics: (id: string): Promise<Lyrics> => ipcRenderer.invoke('ym:lyrics', id),
  similar: (id: string): Promise<Track[]> => ipcRenderer.invoke('ym:similar', id),

  pins: (): Promise<Pin[]> => ipcRenderer.invoke('ym:pins'),
  playlists: (): Promise<PlaylistInfo[]> => ipcRenderer.invoke('ym:playlists'),
  collection: (ref: CollectionRef): Promise<Collection> => ipcRenderer.invoke('ym:collection', ref),
  setPin: (ref: CollectionRef, pinned: boolean): Promise<void> =>
    ipcRenderer.invoke('ym:set-pin', ref, pinned),

  waveStart: (seed?: string): Promise<WaveBatch> => ipcRenderer.invoke('ym:wave-start', seed),
  waveNext: (sessionId: string, lastTrackId: string): Promise<WaveBatch> =>
    ipcRenderer.invoke('ym:wave-next', sessionId, lastTrackId),
  waveFeedback: (
    sessionId: string,
    batchId: string,
    type: WaveEvent,
    trackId?: string,
    playedSeconds?: number
  ): Promise<void> =>
    ipcRenderer.invoke('ym:wave-feedback', sessionId, batchId, type, trackId, playedSeconds),

  setQuality: (quality: Quality): Promise<void> =>
    ipcRenderer.invoke('settings:set-quality', quality)
}

export type Api = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
