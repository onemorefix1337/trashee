import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  Account,
  CacheInfo,
  Collection,
  CollectionRef,
  DeviceCode,
  Lyrics,
  LyricsQuery,
  OfflineState,
  Pin,
  PlaylistInfo,
  Quality,
  Restore,
  Track,
  WaveBatch,
  WaveEvent
} from '../shared/types'
import type { MiniAnchor, MiniCommand, MiniLook, MiniTrack } from '../shared/mini'
import type { AppInfo, UpdateState } from '../shared/update'

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
  lyrics: (query: LyricsQuery): Promise<Lyrics> => ipcRenderer.invoke('ym:lyrics', query),
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
    ipcRenderer.invoke('settings:set-quality', quality),

  prefetch: (id: string): Promise<void> => ipcRenderer.invoke('cache:prefetch', id),
  cacheInfo: (): Promise<CacheInfo> => ipcRenderer.invoke('cache:info'),
  clearStreamCache: (): Promise<void> => ipcRenderer.invoke('cache:clear-stream'),
  offlineState: (): Promise<OfflineState> => ipcRenderer.invoke('offline:state'),
  saveOffline: (target: 'liked' | CollectionRef): Promise<void> =>
    ipcRenderer.invoke('offline:save', target),
  cancelOffline: (key: string): Promise<void> => ipcRenderer.invoke('offline:cancel', key),
  removeOffline: (key: string): Promise<void> => ipcRenderer.invoke('offline:remove', key),
  removeAllOffline: (): Promise<void> => ipcRenderer.invoke('offline:remove-all'),
  onOfflineState: (callback: (state: OfflineState) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, state: OfflineState): void => callback(state)
    ipcRenderer.on('offline:state', handler)
    return () => ipcRenderer.removeListener('offline:state', handler)
  },
  downloadTrack: (track: { id: string; title: string; artists: string[] }): Promise<string> =>
    ipcRenderer.invoke('track:download', track),
  reveal: (path: string): Promise<void> => ipcRenderer.invoke('app:reveal', path),

  miniState: (track: MiniTrack | null): void => ipcRenderer.send('mini:state', track),
  miniToggle: (): Promise<void> => ipcRenderer.invoke('mini:toggle'),
  miniConfig: (): Promise<{ anchor: MiniAnchor; visible: boolean } & MiniLook> =>
    ipcRenderer.invoke('mini:config'),
  miniSetLook: (look: Partial<MiniLook>): Promise<void> =>
    ipcRenderer.invoke('mini:set-look', look),
  onMiniLook: (callback: (look: MiniLook) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, look: MiniLook): void => callback(look)
    ipcRenderer.on('mini:look', handler)
    return () => ipcRenderer.removeListener('mini:look', handler)
  },
  miniSetAnchor: (anchor: MiniAnchor): Promise<void> =>
    ipcRenderer.invoke('mini:set-anchor', anchor),
  onMiniVisible: (callback: (visible: boolean) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, visible: boolean): void => callback(visible)
    ipcRenderer.on('mini:visible', handler)
    return () => ipcRenderer.removeListener('mini:visible', handler)
  },
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  update: {
    get: (): Promise<UpdateState> => ipcRenderer.invoke('update:get'),
    check: (): Promise<void> => ipcRenderer.invoke('update:check'),
    install: (): Promise<void> => ipcRenderer.invoke('update:install'),
    cancel: (): Promise<void> => ipcRenderer.invoke('update:cancel'),
    show: (): Promise<void> => ipcRenderer.invoke('update:show'),
    later: (): Promise<void> => ipcRenderer.invoke('update:later'),
    skip: (): Promise<void> => ipcRenderer.invoke('update:skip'),
    dismiss: (): Promise<void> => ipcRenderer.invoke('update:dismiss'),
    setAuto: (auto: boolean): Promise<void> => ipcRenderer.invoke('update:set-auto', auto),
    openPage: (): Promise<void> => ipcRenderer.invoke('update:open-page'),
    reveal: (): Promise<void> => ipcRenderer.invoke('update:reveal'),
    openFile: (): Promise<void> => ipcRenderer.invoke('update:open-file'),
    quit: (): Promise<void> => ipcRenderer.invoke('update:quit'),
    onState: (callback: (state: UpdateState) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, state: UpdateState): void => callback(state)
      ipcRenderer.on('update:state', handler)
      return () => ipcRenderer.removeListener('update:state', handler)
    }
  },
  onMiniCommand: (callback: (command: MiniCommand) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, command: MiniCommand): void => callback(command)
    ipcRenderer.on('mini:command', handler)
    return () => ipcRenderer.removeListener('mini:command', handler)
  }
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
