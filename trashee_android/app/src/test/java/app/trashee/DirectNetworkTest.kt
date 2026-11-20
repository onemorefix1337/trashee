package app.trashee

import app.trashee.api.DirectNetwork
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DirectNetworkTest {
    @Test
    fun identifiesYandexHosts() {
        assertTrue(DirectNetwork.isYandexHost("api.music.yandex.net"))
        assertTrue(DirectNetwork.isYandexHost("avatars.yandex.net"))
        assertTrue(DirectNetwork.isYandexHost("storage.yandex.net"))
        assertTrue(DirectNetwork.isYandexHost("music.yandex.ru"))
        assertTrue(DirectNetwork.isYandexHost("oauth.yandex.ru"))
        assertTrue(DirectNetwork.isYandexHost("passport.yandex.com"))
        assertTrue(DirectNetwork.isYandexHost("music.yandex.kz"))
        assertTrue(DirectNetwork.isYandexHost("ya.ru"))
        assertTrue(DirectNetwork.isYandexHost("ya.cc"))

        assertFalse(DirectNetwork.isYandexHost("google.com"))
        assertFalse(DirectNetwork.isYandexHost("youtube.com"))
        assertFalse(DirectNetwork.isYandexHost("spotify.com"))
        assertFalse(DirectNetwork.isYandexHost("lrclib.net"))
    }
}
