package app.trashee.data

import android.content.Context
import app.trashee.api.sharedHttp
import app.trashee.player.Caches
import app.trashee.player.coverUrl
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import okhttp3.Request

// The sizes the interface asks covers in: lists, cards, the collection page, the player.
private val COVER_SIZES = listOf("100x100", "200x200", "400x400", "600x600")
private const val PARALLEL = 2

@Serializable
data class RefDto(val type: String, val uid: Long? = null, val kind: Long? = null, val uuid: String? = null, val id: Long? = null)

fun CollectionRef.toDto(): RefDto = when (this) {
    is CollectionRef.Playlist -> RefDto("playlist", uid = uid, kind = kind, uuid = uuid)
    is CollectionRef.AlbumRef -> RefDto("album", id = id)
    is CollectionRef.ArtistRef -> RefDto("artist", id = id)
}

fun RefDto.toRef(): CollectionRef? = when (type) {
    "playlist" -> CollectionRef.Playlist(uid, kind, uuid)
    "album" -> id?.let { CollectionRef.AlbumRef(it) }
    "artist" -> id?.let { CollectionRef.ArtistRef(it) }
    else -> null
}

/** Everything a saved collection needs to be shown and played without a connection. */
@Serializable
data class SavedCollection(
    val key: String,
    val title: String,
    val subtitle: String,
    val coverUri: String? = null,
    val savedAt: Long,
    val tracks: List<Track>,
    /** Null for the liked tracks, which are only a list. */
    val ref: RefDto? = null,
    val artists: List<Artist> = emptyList(),
    val albums: List<AlbumInfo> = emptyList(),
    val trackCount: Int = tracks.size,
)

fun SavedCollection.toCollection(requested: CollectionRef): Collection = Collection(
    ref = ref?.toRef() ?: requested,
    title = title,
    subtitle = subtitle,
    coverUri = coverUri,
    trackCount = trackCount,
    tracks = tracks,
    artists = artists,
    albums = albums,
)

class Loaded(
    val title: String,
    val subtitle: String,
    val coverUri: String?,
    val tracks: List<Track>,
    val collection: Collection? = null,
)

private fun sha1(text: String): String =
    MessageDigest.getInstance("SHA-1").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }

private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

/** Collections the user chose to keep: tracks, covers, lyrics, and the page itself. */
class OfflineLibrary(
    context: Context,
    private val caches: Caches,
    private val lyrics: suspend (Track) -> Lyrics,
) {
    private val dir = File(context.filesDir, "offline-meta").apply { mkdirs() }
    private val coversDir = File(dir, "covers").apply { mkdirs() }
    private val lyricsDir = File(dir, "lyrics").apply { mkdirs() }
    private val mutex = Mutex()

    private var entries: Map<String, SavedCollection> = load()
    private val _saved = MutableStateFlow(entries.values.sortedByDescending { it.savedAt })
    val saved: StateFlow<List<SavedCollection>> = _saved.asStateFlow()

    private val _progress = MutableStateFlow<Map<String, OfflineProgress>>(emptyMap())
    /** Collections being saved right now. */
    val progress: StateFlow<Map<String, OfflineProgress>> = _progress.asStateFlow()

    private val cancelled = HashSet<String>()

    private fun load(): Map<String, SavedCollection> = try {
        json.decodeFromString(MapSerializer(String.serializer(), SavedCollection.serializer()), File(dir, "index.json").readText())
    } catch (_: Exception) {
        emptyMap()
    }

    private fun persist() {
        val target = File(dir, "index.json")
        val temp = File(dir, "index.json.tmp")
        temp.writeText(json.encodeToString(MapSerializer(String.serializer(), SavedCollection.serializer()), entries))
        temp.renameTo(target)
        _saved.value = entries.values.sortedByDescending { it.savedAt }
    }

    fun get(key: String): SavedCollection? = entries[key]

    fun isEmpty(): Boolean = entries.isEmpty()

    /* ---------- covers and lyrics ---------- */

    /** The file of a cover saved with a collection; asked by the image loader before it goes online. */
    fun coverFor(url: String): File? = File(coversDir, sha1(url)).takeIf { it.exists() }

    fun lyricsOf(trackId: String): Lyrics? = try {
        json.decodeFromString(Lyrics.serializer(), File(lyricsDir, "$trackId.json").readText())
    } catch (_: Exception) {
        null
    }

    private suspend fun saveCover(uri: String, size: String) = withContext(Dispatchers.IO) {
        val url = coverUrl(uri, size) ?: return@withContext
        val target = File(coversDir, sha1(url))
        if (target.exists()) return@withContext
        sharedHttp.newCall(Request.Builder().url(url).build()).execute().use { response ->
            if (response.isSuccessful) {
                val temp = File(coversDir, "${target.name}.tmp")
                temp.writeBytes(response.body.bytes())
                temp.renameTo(target)
            }
        }
    }

    /* ---------- saving and removing ---------- */

    /** Saves a collection. Tracks that fail are counted and skipped; the rest still gets saved. */
    suspend fun save(key: String, load: suspend () -> Loaded) {
        if (key in _progress.value) return
        fun update(done: Int, total: Int, failed: Int) {
            _progress.value = _progress.value + (key to OfflineProgress(true, done, total, failed))
        }
        synchronized(cancelled) { cancelled.remove(key) }
        update(0, 0, 0)
        try {
            val loaded = load()
            val tracks = loaded.tracks.filter { it.available }
            var done = 0
            var failed = 0
            update(0, tracks.size, 0)
            val queue = tracks.iterator()
            val lock = Any()
            kotlinx.coroutines.coroutineScope {
                List(minOf(PARALLEL, tracks.size)) {
                    async {
                        while (true) {
                            val track = synchronized(lock) { if (queue.hasNext()) queue.next() else null } ?: break
                            if (synchronized(cancelled) { key in cancelled }) break
                            try {
                                caches.saveOffline(track.id)
                                runCatching { lyrics(track) }.getOrNull()?.takeIf { it.hasText || it.instrumental }?.let {
                                    File(lyricsDir, "${track.id}.json").writeText(json.encodeToString(Lyrics.serializer(), it))
                                }
                            } catch (error: CancellationException) {
                                throw error
                            } catch (_: Exception) {
                                synchronized(lock) { failed += 1 }
                            }
                            synchronized(lock) { done += 1 }
                            update(done, tracks.size, failed)
                        }
                    }
                }.awaitAll()
            }
            if (synchronized(cancelled) { key in cancelled }) return

            val covers = LinkedHashSet<String>()
            loaded.coverUri?.let(covers::add)
            tracks.mapNotNullTo(covers) { it.coverUri }
            for (uri in covers) for (size in COVER_SIZES) runCatching { saveCover(uri, size) }

            val page = loaded.collection
            mutex.withLock {
                entries = entries + (key to SavedCollection(
                    key = key,
                    title = loaded.title,
                    subtitle = loaded.subtitle,
                    coverUri = loaded.coverUri,
                    savedAt = System.currentTimeMillis(),
                    tracks = tracks,
                    ref = page?.ref?.toDto(),
                    artists = page?.artists.orEmpty(),
                    albums = page?.albums.orEmpty(),
                    trackCount = page?.trackCount ?: tracks.size,
                ))
                persist()
            }
        } finally {
            _progress.value = _progress.value - key
        }
    }

    fun cancel(key: String) {
        synchronized(cancelled) { cancelled.add(key) }
    }

    /** Forgets one collection; tracks, lyrics and covers that no other saved collection uses go with it. */
    suspend fun remove(key: String) = mutex.withLock {
        if (key !in entries) return@withLock
        entries = entries - key
        persist()
        collectGarbage()
    }

    suspend fun removeAll() = mutex.withLock {
        entries = emptyMap()
        persist()
        collectGarbage()
    }

    private fun collectGarbage() {
        val keepTracks = HashSet<String>()
        val keepCovers = HashSet<String>()
        for (entry in entries.values) {
            entry.coverUri?.let { uri -> COVER_SIZES.mapNotNullTo(keepCovers) { coverUrl(uri, it)?.let(::sha1) } }
            for (track in entry.tracks) {
                keepTracks += track.id
                track.coverUri?.let { uri -> COVER_SIZES.mapNotNullTo(keepCovers) { coverUrl(uri, it)?.let(::sha1) } }
            }
        }
        lyricsDir.listFiles()?.forEach { if (it.nameWithoutExtension !in keepTracks) it.delete() }
        coversDir.listFiles()?.forEach { if (it.name !in keepCovers) it.delete() }
        for (id in caches.savedIds()) if (id !in keepTracks) caches.removeSaved(id)
    }
}
