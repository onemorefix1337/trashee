@file:OptIn(UnstableApi::class)

package app.trashee.data

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSourceInputStream
import androidx.media3.datasource.DataSpec
import app.trashee.player.Caches
import app.trashee.player.trackUri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

val EXT_BY_CODEC = mapOf(
    "mp3" to "mp3",
    "aac" to "aac",
    "he-aac" to "aac",
    "flac" to "flac",
    "aac-mp4" to "m4a",
    "he-aac-mp4" to "m4a",
    "flac-mp4" to "m4a",
)

val MIME_BY_EXT = mapOf(
    "mp3" to "audio/mpeg",
    "aac" to "audio/aac",
    "flac" to "audio/flac",
    "m4a" to "audio/mp4",
)

/** A name that is safe on every file system: no separators or reserved characters, not too long. */
fun safeFileName(name: String, max: Int = 120): String {
    val cleaned = name
        .replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), " ")
        .replace(Regex("\\s+"), " ")
        .replace(Regex("^[.\\s]+|[.\\s]+$"), "")
    return cleaned.take(max).trim().replace(Regex("[.\\s]+$"), "").ifEmpty { "track" }
}

/**
 * Saves a track as a music file in Music/trashee, where any player finds it. Returns the file name.
 * Goes through the same cache as playback, so a track that was already heard or saved is not fetched again.
 */
suspend fun saveTrackFile(context: Context, caches: Caches, track: Track): String = withContext(Dispatchers.IO) {
    val codec = caches.infos.info(track.id).codec
    val ext = EXT_BY_CODEC[codec] ?: "mp3"
    val name = "${safeFileName(listOf(track.artistNames, track.title).filter { it.isNotEmpty() }.joinToString(" - "))}.$ext"

    val values = ContentValues().apply {
        put(MediaStore.Audio.Media.DISPLAY_NAME, name)
        put(MediaStore.Audio.Media.MIME_TYPE, MIME_BY_EXT[ext] ?: "audio/mpeg")
        put(MediaStore.Audio.Media.TITLE, track.title)
        put(MediaStore.Audio.Media.ARTIST, track.artistNames)
        track.albums.firstOrNull()?.let { put(MediaStore.Audio.Media.ALBUM, it.title) }
        put(MediaStore.Audio.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MUSIC}/trashee")
        put(MediaStore.Audio.Media.IS_PENDING, 1)
    }
    val resolver = context.contentResolver
    val collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val uri = resolver.insert(collection, values) ?: error("Не удалось создать файл")
    try {
        resolver.openOutputStream(uri)!!.use { out ->
            DataSourceInputStream(caches.fullTrackSource(), DataSpec(trackUri(track.id))).use { it.copyTo(out) }
        }
        resolver.update(uri, ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }, null, null)
    } catch (error: Exception) {
        resolver.delete(uri, null, null)
        throw error
    }
    name
}
