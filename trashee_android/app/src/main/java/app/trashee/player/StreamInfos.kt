package app.trashee.player

import app.trashee.api.YandexClient
import app.trashee.data.FileInfo
import app.trashee.data.Quality
import java.util.concurrent.ConcurrentHashMap

private const val INFO_TTL_MS = 10 * 60 * 1000L

/** Download links of tracks, kept for a while because they are short-lived anyway. */
class StreamInfos(private val api: () -> YandexClient?, private val quality: () -> Quality) {
    private class Cached(val info: FileInfo, val expires: Long)

    private val cache = ConcurrentHashMap<String, Cached>()

    /** Blocking: called from the audio loading thread. Plain files first, encrypted ones as the fallback. */
    fun info(trackId: String): FileInfo {
        val wanted = quality()
        val key = "$trackId:${wanted.wire}"
        cache[key]?.takeIf { it.expires > System.currentTimeMillis() }?.let { return it.info }

        val client = api() ?: throw java.io.IOException("Не выполнен вход")
        val info = try {
            client.fileInfoSync(trackId, wanted, "raw")
        } catch (_: Exception) {
            client.fileInfoSync(trackId, wanted, "encraw")
        }
        cache[key] = Cached(info, System.currentTimeMillis() + INFO_TTL_MS)
        return info
    }

    fun forget(trackId: String) {
        cache.keys.removeAll { it.startsWith("$trackId:") }
    }
}
