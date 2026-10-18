package app.trashee.api

import app.trashee.data.Album
import app.trashee.data.AlbumInfo
import app.trashee.data.Artist
import app.trashee.data.CollectionRef
import app.trashee.data.Pin
import app.trashee.data.PinType
import app.trashee.data.PlaylistInfo
import app.trashee.data.Track
import app.trashee.data.bool
import app.trashee.data.get
import app.trashee.data.int
import app.trashee.data.key
import app.trashee.data.list
import app.trashee.data.long
import app.trashee.data.str
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// Turns raw Yandex Music JSON into the app's types. Every field is optional on the wire, so be forgiving.

fun normalizeTrack(raw: JsonElement?): Track = Track(
    id = (raw["realId"].str() ?: raw["id"].str()).orEmpty(),
    title = raw["title"].str().orEmpty(),
    version = raw["version"].str(),
    durationMs = raw["durationMs"].long() ?: 0,
    artists = raw["artists"].list().mapNotNull { a ->
        a["id"].long()?.let { Artist(it, a["name"].str().orEmpty()) }
    },
    albums = raw["albums"].list().mapNotNull { a ->
        a["id"].long()?.let { Album(it, a["title"].str().orEmpty(), a["year"].int()) }
    },
    coverUri = raw["coverUri"].str() ?: raw["ogImage"].str(),
    available = raw["available"].bool() != false,
    explicit = raw["explicit"].bool() == true || raw["contentWarning"].str() == "explicit",
)

/** Cover URI template ("host/path/%%"); mosaic covers (several pictures) use their first picture. */
fun coverOf(raw: JsonElement?): String? =
    raw["cover"]["uri"].str() ?: raw["cover"]["itemsUri"][0].str() ?: raw["coverUri"].str() ?: raw["ogImage"].str()

fun playlistRef(raw: JsonElement?): CollectionRef.Playlist? {
    val uid = (raw["uid"] ?: raw["owner"]["uid"]).long()
    val kind = raw["kind"].long()
    val uuid = (raw["playlistUuid"] ?: raw["uuid"]).str()
    if (uid == null && kind == null && uuid.isNullOrEmpty()) return null
    val both = uid != null && kind != null
    return CollectionRef.Playlist(if (both) uid else null, if (both) kind else null, uuid?.takeIf { it.isNotEmpty() })
}

fun ownerName(raw: JsonElement?): String = raw["owner"]["name"].str() ?: raw["owner"]["login"].str().orEmpty()

fun normalizePlaylistInfo(raw: JsonElement?, myUid: Long): PlaylistInfo? {
    val ref = playlistRef(raw) ?: return null
    return PlaylistInfo(
        ref = ref,
        key = ref.key(),
        title = raw["title"].str() ?: "Без названия",
        owner = ownerName(raw),
        mine = (raw["uid"] ?: raw["owner"]["uid"]).long() == myUid,
        coverUri = coverOf(raw),
        trackCount = raw["trackCount"].int() ?: 0,
    )
}

private fun waveSeed(data: JsonElement?): String? =
    data["seeds"][0].str() ?: data["seeds"].str() ?: data["seed"].str()

fun normalizePin(raw: JsonElement?): Pin? {
    val data = raw["data"]
    return when (raw["type"].str()) {
        "playlist_item" -> {
            val ref = playlistRef(data) ?: return null
            Pin(ref.key(), PinType.Playlist, data["title"].str() ?: "Плейлист", "Плейлист", coverOf(data), ref, null)
        }
        "album_item" -> {
            val id = data["id"].long() ?: return null
            val ref = CollectionRef.AlbumRef(id)
            Pin(ref.key(), PinType.Album, data["title"].str() ?: "Альбом", "Альбом", coverOf(data), ref, null)
        }
        "artist_item" -> {
            val id = data["id"].long() ?: return null
            val ref = CollectionRef.ArtistRef(id)
            Pin(ref.key(), PinType.Artist, data["name"].str() ?: "Исполнитель", "Исполнитель", coverOf(data), ref, null)
        }
        "wave_item" -> {
            val seed = waveSeed(data)
            val title = data["title"].str() ?: data["name"].str() ?: "Моя волна"
            Pin("wave:${seed ?: title}", PinType.Wave, title, "Моя волна", coverOf(data), null, seed)
        }
        else -> null
    }
}

fun normalizeArtists(raw: JsonElement?): List<Artist> =
    raw["artists"].list().mapNotNull { a -> a["id"].long()?.let { Artist(it, a["name"].str().orEmpty()) } }

/** Releases of an artist; the year may only be inside the release date. */
fun normalizeAlbumInfo(raw: JsonElement?): AlbumInfo? {
    val id = raw["id"].long() ?: return null
    val type = raw["type"].str()
    return AlbumInfo(
        id = id,
        title = raw["title"].str() ?: "Без названия",
        year = raw["year"].int() ?: raw["releaseDate"].str()?.take(4)?.toIntOrNull(),
        coverUri = raw["coverUri"].str() ?: raw["ogImage"].str(),
        trackCount = raw["trackCount"].int() ?: 0,
        kind = type?.takeIf { it != "single-album" },
    )
}

/** True when a playlist as Yandex returns it already holds the track (ids may come as "track:album"). */
fun playlistHasTrack(raw: JsonElement?, trackId: String): Boolean =
    raw["tracks"].list().any { item ->
        ((item["id"] ?: item["track"]["id"]).str() ?: "").substringBefore(':') == trackId
    }

/** The `diff` Yandex expects for putting one track at position [at] of a playlist. */
fun playlistInsertDiff(trackId: String, albumId: Long?, at: Int): String = buildJsonArray {
    add(
        buildJsonObject {
            put("op", "insert")
            put("at", at)
            put(
                "tracks",
                buildJsonArray {
                    add(
                        buildJsonObject {
                            put("id", trackId)
                            if (albumId != null) put("albumId", albumId)
                        },
                    )
                },
            )
        },
    )
}.toString()
