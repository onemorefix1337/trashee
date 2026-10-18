package app.trashee.data

import kotlinx.serialization.Serializable

@Serializable
data class Artist(val id: Long, val name: String)

@Serializable
data class Album(val id: Long, val title: String, val year: Int?)

@Serializable
data class Track(
    val id: String,
    val title: String,
    val version: String?,
    val durationMs: Long,
    val artists: List<Artist>,
    val albums: List<Album>,
    val coverUri: String?,
    val available: Boolean,
    val explicit: Boolean,
) {
    val artistNames: String get() = artists.joinToString(", ") { it.name }
}

data class Account(val uid: Long, val login: String, val hasPlus: Boolean)

data class DeviceCode(
    val deviceCode: String,
    val userCode: String,
    val verificationUrl: String,
    val intervalSec: Int,
    val expiresInSec: Int,
)

/** Something with a list of tracks that can be opened, played and pinned. */
sealed interface CollectionRef {
    data class Playlist(val uid: Long?, val kind: Long?, val uuid: String?) : CollectionRef
    data class AlbumRef(val id: Long) : CollectionRef
    data class ArtistRef(val id: Long) : CollectionRef
}

fun CollectionRef.key(): String = when (this) {
    is CollectionRef.Playlist -> if (uid != null && kind != null) "playlist:$uid:$kind" else "playlist:$uuid"
    is CollectionRef.AlbumRef -> "album:$id"
    is CollectionRef.ArtistRef -> "artist:$id"
}

@Serializable
data class AlbumInfo(
    val id: Long,
    val title: String,
    val year: Int?,
    val coverUri: String?,
    val trackCount: Int,
    val kind: String?,
)

data class Collection(
    val ref: CollectionRef,
    val title: String,
    val subtitle: String,
    val coverUri: String?,
    val trackCount: Int,
    val tracks: List<Track>,
    val artists: List<Artist>,
    val albums: List<AlbumInfo>,
)

data class PlaylistInfo(
    val ref: CollectionRef,
    val key: String,
    val title: String,
    val owner: String,
    val mine: Boolean,
    val coverUri: String?,
    val trackCount: Int,
)

enum class PinType { Playlist, Album, Artist, Wave }

data class Pin(
    val key: String,
    val type: PinType,
    val title: String,
    val subtitle: String,
    val coverUri: String?,
    val ref: CollectionRef?,
    val seed: String?,
)

@Serializable
data class LyricLine(val time: Double, val text: String)

@Serializable
data class LyricsSource(val name: String, val url: String? = null)

@Serializable
data class Lyrics(
    val synced: List<LyricLine>?,
    val text: String?,
    val source: LyricsSource?,
    val instrumental: Boolean = false,
) {
    val hasText: Boolean get() = synced != null || !text.isNullOrBlank()

    companion object {
        val None = Lyrics(null, null, null)
    }
}

data class LyricsQuery(
    val id: String,
    val title: String,
    val artists: List<String>,
    val album: String?,
    val durationSec: Double,
)

enum class Quality(val wire: String, val label: String, val codecs: List<String>) {
    Nq("nq", "Экономное", listOf("aac", "mp3")),
    Hq("hq", "Высокое", listOf("aac", "mp3")),
    Lossless("lossless", "Без потерь", listOf("flac", "aac", "mp3")),
}

data class FileInfo(
    val trackId: String,
    val quality: String,
    val codec: String,
    val bitrate: Int,
    val transport: String,
    val url: String,
    val key: String?,
)

data class WaveBatch(val sessionId: String, val batchId: String, val tracks: List<Track>)

enum class WaveEvent(val wire: String) {
    RadioStarted("radioStarted"),
    TrackStarted("trackStarted"),
    TrackFinished("trackFinished"),
    Skip("skip"),
    Like("like"),
    Dislike("dislike"),
}

/** How far saving a collection for offline listening has got. */
data class OfflineProgress(val saving: Boolean, val done: Int, val total: Int, val failed: Int)

/** What the settings list: a collection that was saved on purpose. */
data class SavedInfo(val key: String, val title: String, val subtitle: String, val trackCount: Int, val savedAt: Long)
