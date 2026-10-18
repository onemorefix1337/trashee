import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MiniCommand, MiniLook, MiniTrack } from '../shared/mini'

const listen = <T>(channel: string, callback: (value: T) => void): (() => void) => {
  const handler = (_: IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const mini = {
  command: (command: MiniCommand): void => ipcRenderer.send('mini:command', command),
  close: (): void => ipcRenderer.send('mini:close'),
  /** Opens or closes the line of the lyrics under the controls. */
  setLyrics: (open: boolean): void => ipcRenderer.send('mini:set-lyrics', open),
  /** The closing animation is over; the window can really hide now. */
  hidden: (): void => ipcRenderer.send('mini:hidden'),
  onState: (callback: (track: MiniTrack | null) => void): (() => void) =>
    listen('mini:state', callback),
  onLook: (callback: (look: MiniLook) => void): (() => void) => listen('mini:look', callback),
  onShow: (callback: () => void): (() => void) => listen('mini:show', callback),
  onHide: (callback: () => void): (() => void) => listen('mini:hide', callback)
}

export type MiniApi = typeof mini

contextBridge.exposeInMainWorld('mini', mini)
