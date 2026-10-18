package app.trashee

import app.trashee.api.fileInfoSign
import app.trashee.api.lyricsSign
import app.trashee.api.normalizeAlbumInfo
import app.trashee.api.normalizePin
import app.trashee.api.normalizeTrack
import app.trashee.api.activeLine
import app.trashee.api.parseLrc
import app.trashee.data.CollectionRef
import app.trashee.data.Lyrics
import app.trashee.data.LyricsQuery
import app.trashee.data.EXT_BY_CODEC
import app.trashee.data.MIME_BY_EXT
import app.trashee.data.PinType
import app.trashee.data.safeFileName
import app.trashee.lyrics.LRCLIB_SOURCE
import app.trashee.lyrics.LyricsCandidate
import app.trashee.lyrics.LyricsProvider
import app.trashee.lyrics.OVH_SOURCE
import app.trashee.lyrics.YANDEX_SOURCE
import app.trashee.lyrics.normalizeTitle
import app.trashee.lyrics.pickBest
import app.trashee.lyrics.resolveLyrics
import app.trashee.player.aesCtrCipher
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Assert.fail
import org.junit.Test

/** Every expected value below was produced by the TypeScript implementation of the desktop app. */
class PortTest {
    private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }
    private fun unhex(text: String) = ByteArray(text.length / 2) { text.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    @Test
    fun `file info signature matches the desktop client`() {
        val signed = fileInfoSign("12345:678", "hq", listOf("aac", "mp3"), "raw", 1700000000)
        assertEquals("7aOVjZJuYBi1uFt9Lx5TU6bqqSiF3xbcZU8U1cXRdIc", signed.sign)
    }

    @Test
    fun `lyrics signature uses the numeric id and keeps the padding`() {
        assertEquals("Ucx7ny+5EZuyvj1G6+agFdud6MV8nQXkvdrNs95cyEM=", lyricsSign("12345:678", 1700000000).sign)
    }

    @Test
    fun `AES-CTR decrypts from any offset`() {
        val key = "000102030405060708090a0b0c0d0e0f"
        val plain = ByteArray(100) { (it * 3 % 256).toByte() }
        val cases = mapOf(
            0 to "c6a23d3e8b80499777549f4385eff254437525aca9fff65b0130f3b231a37757",
            37 to "f4d4f99bf204e9e4063a10293ebdb7a8f5609df8f698ef280046ebf0a07016c6",
            48 to "293ebdb7a8f5609df8f698ef280046ebf0a07016c6e309655dc98f33228e3b52",
        )
        for ((offset, cipherHex) in cases) {
            val cipher = aesCtrCipher(key, offset.toLong())
            val decrypted = cipher.update(unhex(cipherHex))
            assertEquals("offset $offset", hex(plain.copyOfRange(offset, offset + 32)), hex(decrypted))
        }
    }

    @Test
    fun `LRC lines are parsed, repeated, offset and sorted`() {
        val lines = parseLrc("[ar:Someone]\n[00:12.50]second\n[00:01.00][00:30.00]chorus\n\nnot a line\n[01:02]end")
        assertEquals(listOf(1.0, 12.5, 30.0, 62.0), lines.map { it.time })
        assertEquals(listOf("chorus", "second", "chorus", "end"), lines.map { it.text })
        val shifted = parseLrc("[offset:500]\n[00:10.00]x")
        assertEquals(9.5, shifted[0].time, 0.0001)
        assertEquals(-1, activeLine(lines, 0.5))
        assertEquals(1, activeLine(lines, 12.6))
        assertEquals(3, activeLine(lines, 999.0))
    }

    @Test
    fun `titles are compared without versions, features and punctuation`() {
        assertEquals("грима", normalizeTitle("Грима (Remastered 2011)"))
        assertEquals("елка", normalizeTitle("Ёлка - 2020 Remaster"))
        assertEquals("song name", normalizeTitle("Song Name feat. Someone"))
        assertEquals("don t stop me now", normalizeTitle("Don't Stop Me Now!"))
        assertEquals("intro", normalizeTitle("Intro - Live"))
    }

    private fun candidate(name: String = "Грима", artist: String = "Evacry", duration: Double? = 180.0, plain: String? = "text", synced: String? = null) =
        LyricsCandidate(name, artist, duration, false, plain, synced)

    @Test
    fun `candidate matching rejects other tracks and prefers synced text`() {
        val artists = listOf("evacry")
        assertNotNull(pickBest(listOf(candidate()), "Грима", artists, 180.0))
        assertNull(pickBest(listOf(candidate(name = "Другая")), "Грима", artists, 180.0))
        assertNull(pickBest(listOf(candidate(artist = "Someone Else")), "Грима", artists, 180.0))
        assertNull(pickBest(listOf(candidate(duration = 260.0)), "Грима", artists, 180.0))
        assertNotNull(pickBest(listOf(candidate(duration = null)), "Грима", artists, 180.0))
        val synced = candidate(synced = "[00:01.00] x", duration = 183.0)
        assertEquals(synced, pickBest(listOf(candidate(), synced), "Грима", artists, 180.0))
        assertNotNull(pickBest(listOf(candidate(artist = "Evacry & Friend")), "Грима", artists, 180.0))
    }

    private val query = LyricsQuery("1", "T", listOf("A"), null, 100.0)
    private fun synced(source: app.trashee.data.LyricsSource = LRCLIB_SOURCE) = Lyrics(listOf(app.trashee.data.LyricLine(1.0, "x")), null, source)
    private fun plain(source: app.trashee.data.LyricsSource = LRCLIB_SOURCE) = Lyrics(null, "words", source)

    private class Fake(override val canSync: Boolean, private val result: Any?) : LyricsProvider {
        var calls = 0
        override suspend fun find(query: LyricsQuery): Lyrics? {
            calls++
            if (result is Throwable) throw result
            return result as Lyrics?
        }
    }

    @Test
    fun `lyrics resolution follows the same rules as the desktop app`() = runBlocking {
        // synced Yandex text ends the search
        var open = Fake(true, synced())
        assertEquals(YANDEX_SOURCE, resolveLyrics(query, { synced(YANDEX_SOURCE) }, listOf(open)).source)
        assertEquals(0, open.calls)

        // nothing from Yandex: first open source with text
        val first = Fake(true, null)
        assertEquals(LRCLIB_SOURCE, resolveLyrics(query, { Lyrics.None }, listOf(first, Fake(true, synced()))).source)

        // plain Yandex text is upgraded to synced
        assertTrue(resolveLyrics(query, { plain(YANDEX_SOURCE) }, listOf(Fake(true, synced()))).synced != null)

        // plain Yandex text is kept, and plain-only sources are not asked
        val ovh = Fake(false, plain(OVH_SOURCE))
        val kept = resolveLyrics(query, { plain(YANDEX_SOURCE) }, listOf(Fake(true, plain()), ovh))
        assertEquals(YANDEX_SOURCE, kept.source)
        assertEquals(0, ovh.calls)

        // plain-only sources are asked when nothing else had text
        assertEquals(OVH_SOURCE, resolveLyrics(query, { Lyrics.None }, listOf(Fake(true, null), Fake(false, plain(OVH_SOURCE)))).source)

        // a broken source is skipped; a failing Yandex still falls back
        assertEquals("words", resolveLyrics(query, { Lyrics.None }, listOf(Fake(true, RuntimeException("offline")), Fake(true, plain()))).text)
        assertEquals(LRCLIB_SOURCE, resolveLyrics(query, { throw RuntimeException("network") }, listOf(Fake(true, plain()))).source)

        // Yandex failing with nothing found elsewhere passes the failure on
        try {
            resolveLyrics(query, { throw RuntimeException("network") }, listOf(Fake(true, null)))
            fail("expected a failure")
        } catch (error: RuntimeException) {
            assertEquals("network", error.message)
        }

        // empty, and instrumental
        assertFalse(resolveLyrics(query, { Lyrics.None }, listOf(Fake(true, null))).hasText)
        val instrumental = resolveLyrics(query, { Lyrics.None }, listOf(Fake(true, Lyrics(null, null, LRCLIB_SOURCE, instrumental = true))))
        assertTrue(instrumental.instrumental)
    }

    @Test
    fun `tracks and pins are read forgivingly`() {
        val json = Json.parseToJsonElement(
            """{"realId":"42","title":"T","durationMs":123000,"artists":[{"id":1,"name":"A"},{"name":"no id"}],
               "albums":[{"id":7,"title":"Al","year":2020}],"coverUri":"x/%%","available":false,"contentWarning":"explicit"}""",
        )
        val track = normalizeTrack(json)
        assertEquals("42", track.id)
        assertEquals(1, track.artists.size)
        assertEquals("A", track.artistNames)
        assertEquals(2020, track.albums[0].year)
        assertFalse(track.available)
        assertTrue(track.explicit)

        val album = Json.parseToJsonElement("""{"type":"album_item","data":{"id":9,"title":"Disc","cover":{"uri":"c/%%"}}}""")
        val pin = normalizePin(album)!!
        assertEquals(PinType.Album, pin.type)
        assertEquals(CollectionRef.AlbumRef(9), pin.ref)
        assertEquals("c/%%", pin.coverUri)
        assertNull(normalizePin(Json.parseToJsonElement("""{"type":"mystery"}""")))

        val release = normalizeAlbumInfo(Json.parseToJsonElement("""{"id":5,"title":"R","releaseDate":"2019-05-01T00:00:00","type":"single"}"""))!!
        assertEquals(2019, release.year)
        assertEquals("single", release.kind)
    }

    @Test
    fun `file names lose characters that break paths`() {
        assertEquals("AC DC Back In Black", safeFileName("AC/DC: Back In Black?"))
        assertEquals("hidden", safeFileName("  ...hidden.. "))
        assertEquals("track", safeFileName("???"))
        assertEquals(120, safeFileName("x".repeat(300)).length)
        assertEquals("Кино — Группа крови", safeFileName("Кино — Группа крови"))
    }

    @Test
    fun `every known codec has an extension and a mime type`() {
        assertEquals("m4a", EXT_BY_CODEC["aac-mp4"])
        assertEquals("aac", EXT_BY_CODEC["he-aac"])
        assertEquals("audio/flac", MIME_BY_EXT[EXT_BY_CODEC["flac"]])
        assertTrue(EXT_BY_CODEC.values.all { it in MIME_BY_EXT })
    }
}
