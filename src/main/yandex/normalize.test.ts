import assert from 'node:assert/strict'
import test from 'node:test'
import {
  coverOf,
  normalizeAlbumInfo,
  normalizeArtists,
  normalizePin,
  normalizePlaylistInfo,
  playlistRef
} from './normalize.ts'

const cover = { type: 'pic', uri: 'avatars.yandex.net/get-music-content/1/abc/%%' }

test('a pinned playlist of another user keeps owner, kind and cover', () => {
  const pin = normalizePin({
    type: 'playlist_item',
    data: { uid: 100500, kind: 3, playlistUuid: 'lk.a1b2', title: 'Мне нравится', cover }
  })
  assert.deepEqual(pin, {
    key: 'playlist:100500:3',
    type: 'playlist',
    title: 'Мне нравится',
    subtitle: 'Плейлист',
    coverUri: cover.uri,
    ref: { type: 'playlist', uid: 100500, kind: 3, uuid: 'lk.a1b2' }
  })
})

test('pinned albums and artists', () => {
  const album = normalizePin({ type: 'album_item', data: { id: 12345, title: 'Album', cover } })
  assert.equal(album?.key, 'album:12345')
  assert.equal(album?.title, 'Album')
  assert.deepEqual(album?.ref, { type: 'album', id: 12345 })

  const artist = normalizePin({ type: 'artist_item', data: { id: '777', name: 'Artist', cover } })
  assert.equal(artist?.key, 'artist:777')
  assert.equal(artist?.title, 'Artist')
  assert.equal(artist?.subtitle, 'Исполнитель')
})

test('a pinned wave is playable only when a seed is present', () => {
  const withSeed = normalizePin({
    type: 'wave_item',
    data: { title: 'Моя волна', seeds: ['user:onyourwave'] }
  })
  assert.equal(withSeed?.type, 'wave')
  assert.equal(withSeed?.seed, 'user:onyourwave')

  const withoutSeed = normalizePin({ type: 'wave_item', data: { title: 'По треку' } })
  assert.equal(withoutSeed?.seed, undefined)
  assert.equal(withoutSeed?.key, 'wave:По треку')
})

test('pins that cannot be opened are dropped', () => {
  assert.equal(normalizePin({ type: 'mystery_item', data: {} }), null)
  assert.equal(normalizePin({ type: 'album_item', data: {} }), null)
  assert.equal(normalizePin({ type: 'playlist_item', data: {} }), null)
  assert.equal(normalizePin(undefined), null)
})

test('a mosaic cover falls back to its first picture', () => {
  assert.equal(coverOf({ cover: { type: 'mosaic', itemsUri: ['a/%%', 'b/%%'] } }), 'a/%%')
  assert.equal(coverOf({ cover }), cover.uri)
  assert.equal(coverOf({}), undefined)
})

test('own and saved playlists are told apart', () => {
  const own = normalizePlaylistInfo(
    {
      uid: 1,
      kind: 5,
      title: 'fav',
      trackCount: 12,
      owner: { uid: 1, login: 'me', name: 'Me' },
      cover
    },
    1
  )
  assert.equal(own?.mine, true)
  assert.equal(own?.key, 'playlist:1:5')
  assert.equal(own?.trackCount, 12)

  const saved = normalizePlaylistInfo(
    {
      uid: 9,
      kind: 2,
      title: 'Чужой',
      trackCount: 3,
      owner: { uid: 9, login: 'other', name: 'Другой' }
    },
    1
  )
  assert.equal(saved?.mine, false)
  assert.equal(saved?.owner, 'Другой')
})

test('a playlist known only by uuid can still be opened', () => {
  assert.deepEqual(playlistRef({ playlistUuid: 'lk.zzz' }), { type: 'playlist', uuid: 'lk.zzz' })
  assert.equal(
    normalizePlaylistInfo({ playlistUuid: 'lk.zzz', title: 'Generated' }, 1)?.key,
    'playlist:lk.zzz'
  )
  assert.equal(playlistRef({}), null)
})

test('artists without an id cannot be linked and are dropped', () => {
  assert.deepEqual(
    normalizeArtists({
      artists: [{ id: 5, name: 'A' }, { name: 'Nobody' }, { id: '7', name: 'B' }]
    }),
    [
      { id: 5, name: 'A' },
      { id: 7, name: 'B' }
    ]
  )
  assert.deepEqual(normalizeArtists({}), [])
})

test('releases take the year from the release date when needed', () => {
  assert.deepEqual(
    normalizeAlbumInfo({
      id: 1,
      title: 'LP',
      year: 2019,
      coverUri: 'a/%%',
      trackCount: 10,
      type: 'single'
    }),
    { id: 1, title: 'LP', year: 2019, coverUri: 'a/%%', trackCount: 10, kind: 'single' }
  )
  const dated = normalizeAlbumInfo({ id: 2, title: 'EP', releaseDate: '2021-05-03T00:00:00+03:00' })
  assert.equal(dated?.year, 2021)
  assert.equal(dated?.kind, undefined)
  assert.equal(normalizeAlbumInfo({ title: 'no id' }), null)
})
