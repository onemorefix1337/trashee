import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseYandexLink } from './yandex-link.ts'

test('albums, artists and tracks are recognized, with or without https and extra query', () => {
  assert.deepEqual(parseYandexLink('https://music.yandex.ru/album/123'), { type: 'album', id: 123 })
  assert.deepEqual(parseYandexLink('music.yandex.ru/artist/456?utm_source=web'), {
    type: 'artist',
    id: 456
  })
  assert.deepEqual(parseYandexLink('  https://music.yandex.ru/album/1/track/22  '), {
    type: 'track',
    id: '22',
    albumId: 1
  })
  assert.deepEqual(parseYandexLink('https://music.yandex.ru/track/77'), { type: 'track', id: '77' })
})

test('playlists come by login and number, or by the id of the newer links', () => {
  assert.deepEqual(parseYandexLink('https://music.yandex.ru/users/mira/playlists/1003'), {
    type: 'playlist',
    login: 'mira',
    kind: 1003
  })
  assert.deepEqual(parseYandexLink('https://music.yandex.ru/playlists/lk.5b2c1d3e-9a'), {
    type: 'playlist',
    uuid: 'lk.5b2c1d3e-9a'
  })
})

test('other Yandex Music domains work too', () => {
  for (const host of [
    'music.yandex.com',
    'music.yandex.by',
    'music.yandex.kz',
    'www.music.yandex.ru',
    'music.ya.ru'
  ])
    assert.deepEqual(parseYandexLink(`https://${host}/album/5`), { type: 'album', id: 5 })
})

test('direct trashee scheme links work', () => {
  assert.deepEqual(parseYandexLink('trashee://track/999'), { type: 'track', id: '999' })
  assert.deepEqual(parseYandexLink('trashee://album/123/track/456'), {
    type: 'track',
    id: '456',
    albumId: 123
  })
  assert.deepEqual(parseYandexLink('trashee://album/789'), { type: 'album', id: 789 })
  assert.deepEqual(parseYandexLink('trashee://artist/55'), { type: 'artist', id: 55 })
  assert.deepEqual(parseYandexLink('trashee://users/alice/playlists/42'), {
    type: 'playlist',
    login: 'alice',
    kind: 42
  })
  assert.deepEqual(parseYandexLink('trashee://playlist/lk.uuid123'), {
    type: 'playlist',
    uuid: 'lk.uuid123'
  })
})

test('search phrases and foreign links are not links', () => {
  for (const text of [
    '',
    'Кино группа крови',
    'https://example.com/album/123',
    'https://music.yandex.ru/',
    'https://music.yandex.ru/album/abc',
    'https://music.yandex.ru/album/1/foo',
    'https://music.yandex.ru.evil.com/album/1',
    'https://evil.com/?u=music.yandex.ru/album/1',
    'music.yandex.ru/album/1 and more',
    'http://[bad'
  ])
    assert.equal(parseYandexLink(text), null, text)
})
