import type { CollectionRef } from './types'

/** Stable identity of a collection, used to match pins, playlists and routes. */
export function refKey(ref: CollectionRef): string {
  switch (ref.type) {
    case 'playlist':
      return ref.uid !== undefined && ref.kind !== undefined
        ? `playlist:${ref.uid}:${ref.kind}`
        : `playlist:${ref.uuid}`
    case 'album':
      return `album:${ref.id}`
    case 'artist':
      return `artist:${ref.id}`
  }
}
