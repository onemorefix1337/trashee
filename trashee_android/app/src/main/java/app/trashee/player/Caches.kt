@file:OptIn(UnstableApi::class)

package app.trashee.player

import android.content.Context
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheKeyFactory
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.ContentMetadata
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import app.trashee.api.sharedHttp
import app.trashee.data.Quality
import app.trashee.data.Repo
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val STREAM_LIMIT_BYTES = 400L * 1024 * 1024

fun trackUri(trackId: String): Uri = Uri.parse("$TRACK_SCHEME://track/$trackId")

/**
 * Whole tracks on disk, decrypted. "stream" empties itself, oldest first; "offline" is what the user saved
 * on purpose and stays until it is removed. Playback reads offline first, then the automatic cache, then the network.
 */
class Caches(context: Context, repo: Repo) {
    val infos = StreamInfos({ repo.api }, { repo.quality.value })
    private val quality: () -> Quality = { repo.quality.value }

    private val database = StandaloneDatabaseProvider(context)
    val stream = SimpleCache(File(context.cacheDir, "tracks"), LeastRecentlyUsedCacheEvictor(STREAM_LIMIT_BYTES), database)
    val offline = SimpleCache(File(context.filesDir, "offline-audio"), NoOpCacheEvictor(), database)

    // The automatic cache is kept per quality; saved tracks play in whatever quality they were saved in.
    private val streamKey = CacheKeyFactory { spec -> "${spec.uri.lastPathSegment}:${quality().wire}" }
    private val offlineKey = CacheKeyFactory { spec -> spec.uri.lastPathSegment.orEmpty() }

    private val network = DataSource.Factory { TrasheeDataSource(OkHttpDataSource.Factory(sharedHttp).createDataSource(), infos) }

    private val streamLayer = CacheDataSource.Factory()
        .setCache(stream)
        .setUpstreamDataSourceFactory(network)
        .setCacheKeyFactory(streamKey)
        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

    /** What the player reads through: saved tracks first (never written to while playing), then the rest. */
    val playback: DataSource.Factory = CacheDataSource.Factory()
        .setCache(offline)
        .setUpstreamDataSourceFactory(streamLayer)
        .setCacheKeyFactory(offlineKey)
        .setCacheWriteDataSinkFactory(null)
        .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

    private val offlineWriter = CacheDataSource.Factory()
        .setCache(offline)
        .setUpstreamDataSourceFactory(network)
        .setCacheKeyFactory(offlineKey)

    private fun cachedFully(cache: SimpleCache, key: String): Boolean {
        val length = ContentMetadata.getContentLength(cache.getContentMetadata(key))
        return length != C.LENGTH_UNSET.toLong() && cache.isCached(key, 0, length)
    }

    fun isSaved(trackId: String): Boolean = cachedFully(offline, trackId)

    fun isCached(trackId: String): Boolean = isSaved(trackId) || cachedFully(stream, "$trackId:${quality().wire}")

    /* ---------- the next track, fetched while this one plays ---------- */

    private var prefetchJob: Job? = null

    /** One prefetch at a time: a new one is not worth starting while the last still runs. */
    fun prefetch(trackId: String, scope: CoroutineScope) {
        if (prefetchJob?.isActive == true || isCached(trackId)) return
        prefetchJob = scope.launch(Dispatchers.IO) {
            try {
                download(streamLayer.createDataSource(), trackId)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                // The track simply loads when it is played.
            }
        }
    }

    /** Blocks until the whole track is in the cache the data source writes to; stops when the coroutine is cancelled. */
    private suspend fun download(source: CacheDataSource, trackId: String, onProgress: (Long) -> Unit = {}) =
        withContext(Dispatchers.IO) {
            val writer = CacheWriter(source, DataSpec(trackUri(trackId)), null) { _, bytes, _ -> onProgress(bytes) }
            val stop = coroutineContext.job.invokeOnCompletion { cause -> if (cause != null) writer.cancel() }
            try {
                writer.cache()
            } finally {
                stop.dispose()
            }
        }

    /** Saves a whole track for offline listening. */
    suspend fun saveOffline(trackId: String) {
        if (isSaved(trackId)) return
        download(offlineWriter.createDataSource(), trackId)
    }

    fun removeSaved(trackId: String) {
        runCatching { offline.removeResource(trackId) }
    }

    fun savedIds(): Set<String> = offline.keys.toSet()

    fun clearStream() {
        for (key in stream.keys.toList()) runCatching { stream.removeResource(key) }
    }

    fun streamBytes(): Long = stream.cacheSpace

    fun offlineBytes(): Long = offline.cacheSpace

    /** A data source that reads a track completely, for saving it as a file. */
    fun fullTrackSource(): DataSource = streamLayer.createDataSource()
}
