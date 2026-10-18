import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import type { Lyrics, OfflineState, Track } from '../../shared/types.ts'
import { TrackCache } from './cache.ts'
import { OfflineLibrary, type Loaded } from './offline.ts'

const audio = Buffer.alloc(50_000, 7)
let server: Server
let base = ''
const covers: string[] = []

before(async () => {
  server = createServer((request, response) => {
    if (request.url?.startsWith('/audio/')) {
      if (request.url === '/audio/bad') {
        response.statusCode = 404
        response.end()
        return
      }
      response.end(audio)
    } else {
      covers.push(request.url ?? '')
      response.setHeader('content-type', 'image/png')
      response.end(Buffer.from([1, 2, 3, 4]))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => server.close())

const track = (id: string, coverUri = `covers.test/${id}/%%`): Track => ({
  id,
  title: `Track ${id}`,
  durationMs: 1000,
  artists: [{ id: 1, name: 'Artist' }],
  albums: [],
  coverUri,
  available: true,
  explicit: false
})

function setup(): {
  library: OfflineLibrary
  cache: TrackCache
  root: string
  states: OfflineState[]
} {
  const root = mkdtempSync(join(tmpdir(), 'trashee-offline-'))
  const cache = new TrackCache(root, {
    streamLimit: 1e9,
    resolve: async (id) => ({
      url: `${base}/audio/${id === 'bad' ? 'bad' : id}`,
      codec: 'mp3',
      transport: 'raw'
    })
  })
  const states: OfflineState[] = []
  const library = new OfflineLibrary(root, {
    cache,
    quality: () => 'hq',
    lyrics: async (t): Promise<Lyrics> => {
      if (t.id === 'nolyrics') throw new Error('offline')
      return { synced: null, text: `words of ${t.id}`, source: { name: 'Test' } }
    },
    emit: (state) => states.push(state),
    fetch: (input, init) =>
      fetch(String(input).replace(/^https:\/\/covers\.test/, `${base}/cover`), init)
  })
  return { library, cache, root, states }
}

const collection = (tracks: Track[], title = 'List'): Loaded => ({
  title,
  subtitle: 'Owner',
  coverUri: 'covers.test/list/%%',
  tracks
})

test('saving a collection keeps its tracks, lyrics, covers and page', async () => {
  const { library, cache, root, states } = setup()
  await library.save('playlist:1:2', async () => collection([track('a'), track('b')]))

  assert.ok(
    cache.find('a', 'lossless') && cache.find('b', 'lossless'),
    'tracks are saved for any quality'
  )
  assert.equal(library.lyricsOf('a')?.text, 'words of a')
  assert.equal(library.lyricsOf('zzz'), null)
  for (const size of ['100x100', '200x200', '400x400', '600x600']) {
    assert.ok(library.coverFile('covers.test/a/%%', size), `cover a ${size}`)
    assert.ok(library.coverFile('covers.test/list/%%', size), `cover of the list ${size}`)
  }
  assert.equal(library.coverFile('covers.test/a/%%', '100x100')?.type, 'image/png')
  assert.equal(library.get('playlist:1:2')?.tracks.length, 2)
  assert.deepEqual(library.state()['playlist:1:2'], {
    status: 'saved',
    done: 2,
    total: 2,
    failed: 0
  })
  assert.equal(states[0]['playlist:1:2'].status, 'saving')
  assert.equal(library.list()[0].title, 'List')
  rmSync(root, { recursive: true })
})

test('progress counts every track and a track that fails does not stop the rest', async () => {
  const { library, root, states } = setup()
  await library.save('album:9', async () => collection([track('a'), track('bad'), track('c')]))
  const sawProgress = states.some(
    (state) => state['album:9']?.status === 'saving' && state['album:9'].done > 0
  )
  assert.equal(sawProgress, true)
  const saving = states.filter((state) => state['album:9']?.status === 'saving')
  assert.equal(saving[saving.length - 1]['album:9'].failed, 1)
  assert.equal(library.get('album:9')?.tracks.length, 3)
  rmSync(root, { recursive: true })
})

test('missing lyrics do not fail the track', async () => {
  const { library, cache, root } = setup()
  await library.save('album:1', async () => collection([track('nolyrics')]))
  assert.ok(cache.find('nolyrics', 'hq'))
  assert.equal(library.lyricsOf('nolyrics'), null)
  rmSync(root, { recursive: true })
})

test('what was saved is still there after a restart', async () => {
  const { library, root } = setup()
  await library.save('album:1', async () => collection([track('a')]))
  const again = new OfflineLibrary(root, {
    cache: new TrackCache(root, {
      streamLimit: 1,
      resolve: async () => ({ url: '', codec: 'mp3', transport: 'raw' })
    }),
    quality: () => 'hq',
    lyrics: async () => ({ synced: null, text: null, source: null }),
    emit: () => undefined
  })
  assert.equal(again.get('album:1')?.title, 'List')
  assert.deepEqual(again.state()['album:1'].status, 'saved')
  rmSync(root, { recursive: true })
})

test('removing a collection keeps what another one still needs', async () => {
  const { library, cache, root } = setup()
  await library.save('one', async () => collection([track('shared'), track('only-one')], 'One'))
  await library.save('two', async () => collection([track('shared'), track('only-two')], 'Two'))
  library.remove('one')
  assert.equal(cache.isSaved('only-one'), false)
  assert.equal(cache.isSaved('shared'), true)
  assert.equal(library.lyricsOf('only-one'), null)
  assert.equal(library.lyricsOf('shared')?.text, 'words of shared')
  assert.equal(library.coverFile('covers.test/only-one/%%', '100x100'), null)
  assert.ok(library.coverFile('covers.test/shared/%%', '100x100'))
  library.removeAll()
  assert.equal(cache.sizes().offline, 0)
  assert.deepEqual(library.list(), [])
  assert.equal(readdirSync(join(root, 'offline-meta', 'covers')).length, 0)
  rmSync(root, { recursive: true })
})

test('unavailable tracks are left out, and a failing load saves nothing', async () => {
  const { library, root } = setup()
  await library.save('x', async () => collection([track('a'), { ...track('b'), available: false }]))
  assert.equal(library.get('x')?.tracks.length, 1)
  await assert.rejects(
    library.save('y', async () => {
      throw new Error('no network')
    }),
    /no network/
  )
  assert.equal(library.get('y'), null)
  assert.equal(library.state().y, undefined)
  rmSync(root, { recursive: true })
})

test('saving the same collection twice at once runs once', async () => {
  const { library, root } = setup()
  let loads = 0
  const load = async (): Promise<Loaded> => {
    loads += 1
    return collection([track('a')])
  }
  await Promise.all([library.save('k', load), library.save('k', load)])
  assert.equal(loads, 1)
  assert.equal(existsSync(join(root, 'offline')), true)
  rmSync(root, { recursive: true })
})
