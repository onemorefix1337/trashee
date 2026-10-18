import { readFileSync } from 'node:fs'
import type { YandexMusic } from './client'
import { decryptFrom } from './decrypt'
import { serveFile, type StreamSource, type TrackCache } from './cache.ts'
import type { FileInfo, Quality } from '../../shared/types'

const INFO_TTL_MS = 10 * 60 * 1000

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  'he-aac': 'audio/aac',
  flac: 'audio/flac',
  'aac-mp4': 'audio/mp4',
  'he-aac-mp4': 'audio/mp4',
  'flac-mp4': 'audio/mp4'
}

interface Cached {
  info: FileInfo
  expires: number
}

export class TrackStreamer {
  private cache = new Map<string, Cached>()
  private files: TrackCache | null = null
  quality: Quality = 'hq'

  constructor(private readonly getApi: () => YandexMusic | null) {}

  /** Tracks found on disk are played from there instead of the network. */
  attachFiles(files: TrackCache): void {
    this.files = files
  }

  /** A fresh download link of a track in the given quality, for the disk cache. */
  async sourceFor(trackId: string, quality: string): Promise<StreamSource> {
    const api = this.getApi()
    if (!api) throw new Error('Не выполнен вход')
    let info: FileInfo
    try {
      info = await api.fileInfo(trackId, quality as Quality, 'raw')
    } catch {
      info = await api.fileInfo(trackId, quality as Quality, 'encraw')
    }
    return { url: info.url, codec: info.codec, transport: info.transport, key: info.key }
  }

  private async info(trackId: string): Promise<FileInfo> {
    const key = `${trackId}:${this.quality}`
    const hit = this.cache.get(key)
    if (hit && hit.expires > Date.now()) return hit.info

    const api = this.getApi()
    if (!api) throw new Error('Не выполнен вход')
    let info: FileInfo
    try {
      info = await api.fileInfo(trackId, this.quality, 'raw')
    } catch {
      info = await api.fileInfo(trackId, this.quality, 'encraw')
    }
    this.cache.set(key, { info, expires: Date.now() + INFO_TTL_MS })
    return info
  }

  async handle(request: Request): Promise<Response> {
    const trackId = new URL(request.url).pathname.replace(/^\//, '')
    try {
      const range = request.headers.get('range')
      const onDisk = this.files?.find(trackId, this.quality)
      if (onDisk) return serveFile(onDisk, range)

      const info = await this.info(trackId)
      const upstream = await fetch(info.url, { headers: range ? { Range: range } : {} })
      if (!upstream.ok && upstream.status !== 206) {
        this.cache.delete(`${trackId}:${this.quality}`)
        return new Response(null, { status: 502 })
      }

      // The renderer reads the audio through Web Audio (visualizer, later the equalizer), which is silent for
      // media it may not inspect. With this privileged scheme Electron 44 lets it through even without the
      // header (checked in a headless test), so this is insurance in case that changes.
      const headers = new Headers({
        'Content-Type': MIME[info.codec] ?? 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
      })
      for (const name of ['content-length', 'content-range']) {
        const value = upstream.headers.get(name)
        if (value) headers.set(name, value)
      }

      let body: ReadableStream<Uint8Array> | null = upstream.body
      if (info.transport === 'encraw' && info.key && body) {
        const start = Number(/bytes=(\d+)-/.exec(range ?? '')?.[1] ?? 0)
        body = body.pipeThrough(decryptFrom(info.key, start))
      }
      return new Response(body, { status: upstream.status, headers })
    } catch (error) {
      return new Response(String(error), { status: 502 })
    }
  }
}

/** Fetches a cover through the main process so the renderer can read its pixels (dominant color). */
export async function coverResponse(
  request: Request,
  saved?: (uri: string, size: string) => { file: string; type: string } | null
): Promise<Response> {
  const url = new URL(request.url)
  const uri = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const size = url.searchParams.get('size') ?? '400x400'
  // Covers saved with an offline collection are used first, so they show up without a connection too.
  const local = saved?.(uri, size)
  if (local) {
    return new Response(readFileSync(local.file), {
      headers: {
        'Content-Type': local.type,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'max-age=86400'
      }
    })
  }
  const upstream = await fetch(`https://${uri.replace('%%', size)}`)
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=86400'
    }
  })
}
