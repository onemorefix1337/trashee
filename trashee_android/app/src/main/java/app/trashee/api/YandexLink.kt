package app.trashee.api

import java.net.URI
import java.net.URLDecoder

/** What a link to Yandex Music points at. */
sealed interface YandexLink {
    data class Track(val id: String, val albumId: Long? = null) : YandexLink
    data class Album(val id: Long) : YandexLink
    data class Artist(val id: Long) : YandexLink
    data class UserPlaylist(val login: String, val kind: Long) : YandexLink
    data class PlaylistUuid(val uuid: String) : YandexLink
}

private val HOST = Regex("^(?:www\\.)?music\\.yandex\\.[a-z]{2,3}$", RegexOption.IGNORE_CASE)
private val NUMBER = Regex("^\\d{1,12}$")
private val UUID = Regex("^[\\w.-]{6,}$")

/**
 * Reads a Yandex Music link (album, track, artist, playlist; with or without "https://").
 * Anything else, including a search phrase, gives null.
 */
fun parseYandexLink(text: String): YandexLink? {
    val trimmed = text.trim()
    if (trimmed.isEmpty() || trimmed.any { it.isWhitespace() }) return null
    val uri = try {
        URI(if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(trimmed)) trimmed else "https://$trimmed")
    } catch (_: Exception) {
        return null
    }
    val host = uri.host ?: return null
    if (!HOST.matches(host)) return null

    val parts = (uri.rawPath ?: "").split('/').filter { it.isNotEmpty() }.map { URLDecoder.decode(it, "UTF-8") }
    val first = parts.getOrNull(0)
    val second = parts.getOrNull(1)
    val third = parts.getOrNull(2)
    val fourth = parts.getOrNull(3)
    fun number(value: String?) = value != null && NUMBER.matches(value)
    return when {
        first == "album" && number(second) && third == "track" && number(fourth) -> YandexLink.Track(fourth!!, second!!.toLong())
        first == "album" && number(second) && parts.size == 2 -> YandexLink.Album(second!!.toLong())
        first == "track" && number(second) && parts.size == 2 -> YandexLink.Track(second!!)
        first == "artist" && number(second) && parts.size == 2 -> YandexLink.Artist(second!!.toLong())
        first == "users" && second != null && third == "playlists" && number(fourth) -> YandexLink.UserPlaylist(second, fourth!!.toLong())
        first == "playlists" && second != null && UUID.matches(second) && parts.size == 2 -> YandexLink.PlaylistUuid(second)
        else -> null
    }
}
