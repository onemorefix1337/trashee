import type { YandexLink } from '../../../shared/yandex-link'
import { openCollection } from './nav'
import { playTracks } from './player'

/** Opens what a pasted Yandex Music link points at: a page for albums, artists and playlists, playback for a track. */
export async function openYandexLink(link: YandexLink): Promise<void> {
  switch (link.type) {
    case 'album':
    case 'artist':
      openCollection({ type: link.type, id: link.id })
      return
    case 'playlist':
      openCollection(
        'login' in link
          ? { type: 'playlist', login: link.login, kind: link.kind }
          : { type: 'playlist', uuid: link.uuid }
      )
      return
    case 'track': {
      const [track] = await window.api.tracks([link.id])
      if (!track) throw new Error('Трек не найден')
      playTracks([track])
      return
    }
  }
}
