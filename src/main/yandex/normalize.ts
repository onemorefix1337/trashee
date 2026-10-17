// Turns raw Yandex Music JSON into the app's types. Every field is optional on the wire, so be forgiving.
import { refKey } from '../../shared/collections.ts'
import type { AlbumInfo, Artist, CollectionRef, Pin, PlaylistInfo, Track } from '../../shared/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

export function normalizeTrack(raw: any): Track {
  return {
    id: String(raw.realId ?? raw.id),
    title: raw.title ?? '',
    version: raw.version,
    durationMs: raw.durationMs ?? 0,
    artists: (raw.artists ?? []).map((a: any) => ({ id: a.id, name: a.name })),
    albums: (raw.albums ?? []).map((a: any) => ({ id: a.id, title: a.title, year: a.year })),
    coverUri: raw.coverUri ?? raw.ogImage,
    available: raw.available !== false,
    explicit: raw.explicit === true || raw.contentWarning === 'explicit'
  }
}

/** Cover URI template ("host/path/%%"); mosaic covers (several pictures) use their first picture. */
export function coverOf(raw: any): string | undefined {
  return raw?.cover?.uri ?? raw?.cover?.itemsUri?.[0] ?? raw?.coverUri ?? raw?.ogImage ?? undefined
}

const asNumber = (value: unknown): number | undefined => {
  const number = Number(value)
  return value === undefined || value === null || !Number.isFinite(number) ? undefined : number
}

export function playlistRef(raw: any): CollectionRef | null {
  const uid = asNumber(raw?.uid ?? raw?.owner?.uid)
  const kind = asNumber(raw?.kind)
  const uuid = raw?.playlistUuid ?? raw?.uuid
  if (uid === undefined && kind === undefined && !uuid) return null
  return {
    type: 'playlist',
    ...(uid !== undefined && kind !== undefined ? { uid, kind } : {}),
    ...(uuid ? { uuid: String(uuid) } : {})
  }
}

export function ownerName(raw: any): string {
  return raw?.owner?.name ?? raw?.owner?.login ?? ''
}

export function normalizePlaylistInfo(raw: any, myUid: number): PlaylistInfo | null {
  const ref = playlistRef(raw)
  if (!ref) return null
  return {
    ref,
    key: refKey(ref),
    title: raw.title ?? 'Без названия',
    owner: ownerName(raw),
    mine: asNumber(raw.uid ?? raw.owner?.uid) === myUid,
    coverUri: coverOf(raw),
    trackCount: raw.trackCount ?? 0
  }
}

/** The seed of a pinned wave is not in the library's model, so look in the likely places. */
function waveSeed(data: any): string | undefined {
  const seeds = data?.seeds
  if (Array.isArray(seeds) && typeof seeds[0] === 'string') return seeds[0]
  if (typeof seeds === 'string') return seeds
  return typeof data?.seed === 'string' ? data.seed : undefined
}

export function normalizePin(raw: any): Pin | null {
  const data = raw?.data ?? {}
  switch (raw?.type) {
    case 'playlist_item': {
      const ref = playlistRef(data)
      if (!ref) return null
      return {
        key: refKey(ref),
        type: 'playlist',
        title: data.title ?? 'Плейлист',
        subtitle: 'Плейлист',
        coverUri: coverOf(data),
        ref
      }
    }
    case 'album_item': {
      const id = asNumber(data.id)
      if (id === undefined) return null
      const ref: CollectionRef = { type: 'album', id }
      return {
        key: refKey(ref),
        type: 'album',
        title: data.title ?? 'Альбом',
        subtitle: 'Альбом',
        coverUri: coverOf(data),
        ref
      }
    }
    case 'artist_item': {
      const id = asNumber(data.id)
      if (id === undefined) return null
      const ref: CollectionRef = { type: 'artist', id }
      return {
        key: refKey(ref),
        type: 'artist',
        title: data.name ?? 'Исполнитель',
        subtitle: 'Исполнитель',
        coverUri: coverOf(data),
        ref
      }
    }
    case 'wave_item': {
      const seed = waveSeed(data)
      const title = data.title ?? data.name ?? 'Моя волна'
      return {
        key: `wave:${seed ?? title}`,
        type: 'wave',
        title,
        subtitle: 'Моя волна',
        coverUri: coverOf(data),
        seed
      }
    }
    default:
      return null
  }
}

export function normalizeArtists(raw: any): Artist[] {
  return (raw?.artists ?? [])
    .map((artist: any) => ({ id: asNumber(artist?.id), name: artist?.name ?? '' }))
    .filter(
      (artist: { id: number | undefined; name: string }): artist is Artist =>
        artist.id !== undefined
    )
}

/** Releases of an artist; the year may only be inside the release date. */
export function normalizeAlbumInfo(raw: any): AlbumInfo | null {
  const id = asNumber(raw?.id)
  if (id === undefined) return null
  return {
    id,
    title: raw.title ?? 'Без названия',
    year: asNumber(raw.year) ?? asNumber(String(raw.releaseDate ?? '').slice(0, 4)),
    coverUri: raw.coverUri ?? raw.ogImage ?? undefined,
    trackCount: raw.trackCount ?? 0,
    kind: raw.type && raw.type !== 'single-album' ? raw.type : undefined
  }
}
