import type { CollectionRef } from './types'

/** Stable identity of a collection, used to match pins, playlists and routes. */
export function refKey(ref: CollectionRef): string {
  switch (ref.type) {
    case 'playlist':
      if (ref.uid !== undefined && ref.kind !== undefined) return `playlist:${ref.uid}:${ref.kind}`
      // A link names the owner by login; the key follows it until the playlist is loaded and has its numeric owner.
      return ref.login !== undefined && ref.kind !== undefined
        ? `playlist:@${ref.login}:${ref.kind}`
        : `playlist:${ref.uuid}`
    case 'album':
      return `album:${ref.id}`
    case 'artist':
      return `artist:${ref.id}`
  }
}
