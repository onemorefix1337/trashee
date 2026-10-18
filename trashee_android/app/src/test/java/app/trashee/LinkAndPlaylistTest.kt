package app.trashee

import app.trashee.api.YandexLink
import app.trashee.api.parseYandexLink
import app.trashee.api.playlistHasTrack
import app.trashee.api.playlistInsertDiff
import app.trashee.data.CollectionRef
import app.trashee.data.key
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LinkAndPlaylistTest {
    @Test
    fun `albums artists and tracks are recognized with or without https and extra query`() {
        assertEquals(YandexLink.Album(123), parseYandexLink("https://music.yandex.ru/album/123"))
        assertEquals(YandexLink.Artist(456), parseYandexLink("music.yandex.ru/artist/456?utm_source=web"))
        assertEquals(YandexLink.Track("22", 1), parseYandexLink("  https://music.yandex.ru/album/1/track/22  "))
        assertEquals(YandexLink.Track("77", null), parseYandexLink("https://music.yandex.ru/track/77"))
    }

    @Test
    fun `playlists come by login and number or by the id of the newer links`() {
        assertEquals(YandexLink.UserPlaylist("mira", 1003), parseYandexLink("https://music.yandex.ru/users/mira/playlists/1003"))
        assertEquals(YandexLink.PlaylistUuid("lk.5b2c1d3e-9a"), parseYandexLink("https://music.yandex.ru/playlists/lk.5b2c1d3e-9a"))
    }

    @Test
    fun `other Yandex Music domains work too`() {
        for (host in listOf("music.yandex.com", "music.yandex.by", "music.yandex.kz", "www.music.yandex.ru")) {
            assertEquals(YandexLink.Album(5), parseYandexLink("https://$host/album/5"))
        }
    }

    @Test
    fun `search phrases and foreign links are not links`() {
        listOf(
            "", "Кино группа крови", "https://example.com/album/123", "https://music.yandex.ru/",
            "https://music.yandex.ru/album/abc", "https://music.yandex.ru/album/1/foo",
            "https://music.yandex.ru.evil.com/album/1", "https://evil.com/?u=music.yandex.ru/album/1",
            "music.yandex.ru/album/1 and more", "http://[bad",
        ).forEach { assertNull(it, parseYandexLink(it)) }
    }

    private val playlist = Json.parseToJsonElement("""{"revision":4,"trackCount":2,"tracks":[{"id":10},{"id":"11:3"},{"track":{"id":"12"}}]}""")

    @Test
    fun `a playlist knows which tracks it holds whatever shape the id comes in`() {
        assertTrue(playlistHasTrack(playlist, "10"))
        assertTrue(playlistHasTrack(playlist, "11"))
        assertTrue(playlistHasTrack(playlist, "12"))
        assertFalse(playlistHasTrack(playlist, "99"))
        assertFalse(playlistHasTrack(null, "10"))
    }

    @Test
    fun `the insert diff is what Yandex expects`() {
        assertEquals("""[{"op":"insert","at":2,"tracks":[{"id":"99","albumId":5}]}]""", playlistInsertDiff("99", 5, 2))
        assertEquals("""[{"op":"insert","at":0,"tracks":[{"id":"1"}]}]""", playlistInsertDiff("1", null, 0))
    }

    @Test
    fun `a playlist from a link is keyed by its owner login until it is loaded`() {
        assertEquals("playlist:@mira:1003", CollectionRef.Playlist(null, 1003, null, "mira").key())
        assertEquals("playlist:7:1003", CollectionRef.Playlist(7, 1003, null).key())
        assertEquals("playlist:abc", CollectionRef.Playlist(null, null, "abc").key())
    }
}
