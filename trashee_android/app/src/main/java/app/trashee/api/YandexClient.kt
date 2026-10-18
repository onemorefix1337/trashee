package app.trashee.api

import app.trashee.BuildConfig
import app.trashee.data.Account
import app.trashee.data.AlbumInfo
import app.trashee.data.Collection
import app.trashee.data.bool
import app.trashee.data.CollectionRef
import app.trashee.data.FileInfo
import app.trashee.data.Lyrics
import app.trashee.data.Pin
import app.trashee.data.PlaylistInfo
import app.trashee.data.Quality
import app.trashee.data.Track
import app.trashee.data.WaveBatch
import app.trashee.data.WaveEvent
import app.trashee.data.get
import app.trashee.lyrics.YANDEX_SOURCE
import app.trashee.data.int
import app.trashee.data.list
import app.trashee.data.long
import app.trashee.data.str
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody

enum class AddResult { Added, Exists }

/** The server answered, and said no (or the answer made no sense). */
class YandexError(message: String, val status: Int? = null) : Exception(message)

/** True only when the server rejected the credentials; network failures and 5xx/451 must not log the user out. */
fun Throwable.isAuthFailure(): Boolean = this is YandexError && (status == 401 || status == 403)

val sharedHttp: OkHttpClient by lazy {
    OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
}

private val json = Json { ignoreUnknownKeys = true; isLenient = true }
private val JSON_TYPE = "application/json".toMediaType()

private const val WAVE_SEED = "user:onyourwave"
private const val TRACKS_PER_REQUEST = 100
private const val ARTIST_TRACKS = 100
private const val ARTIST_ALBUMS = 50

class YandexClient(private val token: String, private val http: OkHttpClient = sharedHttp) {
    @Volatile private var uid: Long? = null

    private class CallSpec(
        val method: String? = null,
        val query: Map<String, Any> = emptyMap(),
        val form: Map<String, String>? = null,
        val body: JsonElement? = null,
        val headers: Map<String, String> = emptyMap(),
    )

    /** Blocking; callers hop to IO themselves (the audio loader thread calls this directly). */
    private fun requestSync(path: String, call: CallSpec = CallSpec()): JsonElement? {
        val url = (BuildConfig.API_BASE + path).toHttpUrl().newBuilder().apply {
            call.query.forEach { (key, value) -> addQueryParameter(key, value.toString()) }
        }.build()

        val body: RequestBody? = when {
            call.form != null -> FormBody.Builder().apply { call.form.forEach { (k, v) -> add(k, v) } }.build()
            call.body != null -> call.body.toString().toRequestBody(JSON_TYPE)
            else -> null
        }
        val method = call.method ?: if (body != null) "POST" else "GET"
        val request = Request.Builder().url(url).method(method, if (method == "GET") null else body ?: ByteArray(0).toRequestBody(null))
            .header("Authorization", "OAuth $token")
            .header("X-Yandex-Music-Client", ANDROID_CLIENT)
            .header("User-Agent", "Yandex-Music-API")
            .header("Accept-Language", "ru")
            .apply { call.headers.forEach { (k, v) -> header(k, v) } }
            .build()

        http.newCall(request).execute().use { response ->
            val text = response.body.string()
            val parsed = runCatching { json.parseToJsonElement(text) }.getOrNull()
            if (!response.isSuccessful) {
                val message = parsed["error"]["message"].str() ?: parsed["result"]["message"].str() ?: "HTTP ${response.code}"
                throw YandexError(message, response.code)
            }
            return parsed["result"] ?: parsed
        }
    }

    private suspend fun request(path: String, call: CallSpec = CallSpec()): JsonElement? =
        withContext(Dispatchers.IO) { requestSync(path, call) }

    suspend fun account(): Account {
        val result = request("/account/status")
        val id = result["account"]["uid"].long() ?: throw YandexError("Токен недействителен", 401)
        uid = id
        return Account(
            uid = id,
            login = result["account"]["login"].str() ?: result["account"]["displayName"].str().orEmpty(),
            hasPlus = result["plus"]["hasPlus"].bool() == true,
        )
    }

    private suspend fun userId(): Long = uid ?: account().uid

    suspend fun search(text: String): List<Track> {
        val result = request(
            "/search",
            CallSpec(query = mapOf("text" to text, "nocorrect" to false, "type" to "track", "page" to 0, "playlist-in-best" to true)),
        )
        return result["tracks"]["results"].list().map(::normalizeTrack)
    }

    suspend fun tracks(ids: List<String>): List<Track> {
        if (ids.isEmpty()) return emptyList()
        val result = request("/tracks", CallSpec(form = mapOf("track-ids" to ids.joinToString(","))))
        return result.list().map(::normalizeTrack)
    }

    suspend fun similar(trackId: String): List<Track> =
        request("/tracks/$trackId/similar")["similarTracks"].list().map(::normalizeTrack)

    suspend fun likedTracks(limit: Int = 150): List<Track> {
        val id = userId()
        val items = request("/users/$id/likes/tracks")["library"]["tracks"].list()
            .sortedByDescending { it["timestamp"].str().orEmpty() }
            .take(limit)
        val tracks = tracks(items.map { t ->
            val album = t["albumId"].str()
            if (album != null) "${t["id"].str()}:$album" else t["id"].str().orEmpty()
        })
        // /tracks does not preserve the requested order.
        val order = items.withIndex().associate { (i, t) -> t["id"].str().orEmpty() to i }
        return tracks.sortedBy { order[it.id] ?: 0 }
    }

    suspend fun likedIds(): List<String> {
        val id = userId()
        return request("/users/$id/likes/tracks")["library"]["tracks"].list().mapNotNull { it["id"].str() }
    }

    suspend fun setLike(trackId: String, liked: Boolean) {
        val id = userId()
        val action = if (liked) "add-multiple" else "remove"
        request("/users/$id/likes/tracks/$action", CallSpec(form = mapOf("track-ids" to trackId)))
    }

    suspend fun setDislike(trackId: String, disliked: Boolean) {
        val id = userId()
        val action = if (disliked) "add-multiple" else "remove"
        request("/users/$id/dislikes/tracks/$action", CallSpec(form = mapOf("track-ids" to trackId)))
    }

    /** Synced lyrics when the track has them, plain text otherwise, empty when there are none. */
    suspend fun lyrics(trackId: String): Lyrics {
        lyricsText(trackId, "LRC")?.let { raw ->
            val lines = parseLrc(raw)
            if (lines.isNotEmpty()) return Lyrics(lines, null, YANDEX_SOURCE)
        }
        val text = lyricsText(trackId, "TEXT")?.trim()
        return if (text.isNullOrEmpty()) Lyrics.None else Lyrics(null, text, YANDEX_SOURCE)
    }

    /** The lyrics endpoint only hands out a link; the text itself lives behind it. */
    private suspend fun lyricsText(trackId: String, format: String): String? = try {
        val (ts, sign) = lyricsSign(trackId)
        val info = request("/tracks/$trackId/lyrics", CallSpec(query = mapOf("format" to format, "timeStamp" to ts, "sign" to sign)))
        val link = info["downloadUrl"].str()
        if (link == null) null else withContext(Dispatchers.IO) {
            http.newCall(Request.Builder().url(link).build()).execute().use { if (it.isSuccessful) it.body.string() else null }
        }
    } catch (error: YandexError) {
        // "This track has no lyrics" arrives as a client error; only real failures are worth reporting.
        if (error.status != null && error.status in 400..499) null else throw error
    }

    /** Download info of a track. The returned URL is short-lived. */
    fun fileInfoSync(trackId: String, quality: Quality, transport: String): FileInfo {
        val (ts, sign) = fileInfoSign(trackId, quality.wire, quality.codecs, transport)
        val result = requestSync(
            "/get-file-info",
            CallSpec(
                query = mapOf(
                    "ts" to ts, "trackId" to trackId, "quality" to quality.wire,
                    "codecs" to quality.codecs.joinToString(","), "transports" to transport, "sign" to sign,
                ),
                headers = mapOf("X-Yandex-Music-Client" to DESKTOP_CLIENT),
            ),
        )
        val info = result["downloadInfo"]
        val url = info["url"].str() ?: throw YandexError("Нет ссылки на файл трека")
        return FileInfo(
            trackId = info["trackId"].str() ?: trackId,
            quality = info["quality"].str().orEmpty(),
            codec = info["codec"].str().orEmpty(),
            bitrate = info["bitrate"].int() ?: 0,
            transport = info["transport"].str() ?: transport,
            url = url,
            key = info["key"].str()?.takeIf { it.isNotEmpty() },
        )
    }

    suspend fun pins(): List<Pin> = request("/pins")["pins"].list().mapNotNull(::normalizePin)

    /** Own playlists followed by playlists saved from other people. */
    suspend fun playlists(): List<PlaylistInfo> = coroutineScope {
        val id = userId()
        val own = async { request("/users/$id/playlists/list").list() }
        // A failure here should not hide the user's own playlists.
        val saved = async { runCatching { request("/users/$id/likes/playlists").list() }.getOrDefault(emptyList()) }
        val seen = HashSet<String>()
        (own.await() + saved.await().map { it["playlist"] ?: it })
            .mapNotNull { normalizePlaylistInfo(it, id) }
            .filter { seen.add(it.key) }
    }

    /** Makes an empty private playlist for the user. */
    suspend fun createPlaylist(title: String): PlaylistInfo {
        val id = userId()
        val raw = request("/users/$id/playlists/create", CallSpec(form = mapOf("title" to title, "visibility" to "private")))
        return normalizePlaylistInfo(raw, id) ?: throw YandexError("Яндекс не создал плейлист")
    }

    /**
     * Puts a track at the end of one of the user's playlists. Yandex wants the revision the change is based on, so the
     * playlist is read first, and once more if somebody else changed it in between. Says [AddResult.Exists] when it was already there.
     */
    suspend fun addToPlaylist(kind: Long, trackId: String, albumId: Long?): AddResult {
        val id = userId()
        for (attempt in 0..1) {
            val current = request("/users/$id/playlists/$kind")
            if (playlistHasTrack(current, trackId)) return AddResult.Exists
            val count = current["trackCount"].int() ?: current["tracks"].list().size
            val form = mapOf(
                "kind" to kind.toString(),
                "revision" to (current["revision"].int() ?: 1).toString(),
                "diff" to playlistInsertDiff(trackId, albumId, count),
            )
            try {
                request("/users/$id/playlists/$kind/change", CallSpec(form = form))
                return AddResult.Added
            } catch (error: YandexError) {
                // A playlist changed from another device between the read and the write: look again, once.
                val stale = error.status == 412 || error.message.orEmpty().contains("revision", ignoreCase = true)
                if (attempt == 0 && stale) continue
                throw error
            }
        }
        throw YandexError("Не удалось изменить плейлист")
    }

    suspend fun collection(ref: CollectionRef): Collection = when (ref) {
        is CollectionRef.Playlist -> {
            val owner: Any? = ref.uid ?: ref.login
            val path = if (owner != null && ref.kind != null) "/users/${java.net.URLEncoder.encode(owner.toString(), "UTF-8")}/playlists/${ref.kind}" else "/playlist/${ref.uuid}"
            val raw = request(path)
            val tracks = resolveTrackItems(raw["tracks"].list())
            Collection(
                ref = playlistRef(raw) ?: ref,
                title = raw["title"].str() ?: "Плейлист",
                subtitle = ownerName(raw),
                coverUri = coverOf(raw),
                trackCount = raw["trackCount"].int() ?: tracks.size,
                tracks = tracks,
                artists = emptyList(),
                albums = emptyList(),
            )
        }
        is CollectionRef.AlbumRef -> {
            val raw = request("/albums/${ref.id}/with-tracks")
            val tracks = raw["volumes"].list().flatMap { it.list() }.map(::normalizeTrack)
            Collection(
                ref = ref,
                title = raw["title"].str() ?: "Альбом",
                subtitle = raw["artists"].list().joinToString(", ") { it["name"].str().orEmpty() },
                coverUri = raw["coverUri"].str() ?: raw["ogImage"].str(),
                trackCount = raw["trackCount"].int() ?: tracks.size,
                tracks = tracks,
                artists = normalizeArtists(raw),
                albums = emptyList(),
            )
        }
        is CollectionRef.ArtistRef -> coroutineScope {
            val info = async { request("/artists/${ref.id}/brief-info") }
            val list = async { request("/artists/${ref.id}/tracks", CallSpec(query = mapOf("page" to 0, "page-size" to ARTIST_TRACKS))) }
            // Releases are a bonus: the page is still useful without them.
            val releases = async {
                runCatching {
                    request("/artists/${ref.id}/direct-albums", CallSpec(query = mapOf("page" to 0, "page-size" to ARTIST_ALBUMS, "sort-by" to "year")))
                }.getOrNull()
            }
            val tracks = list.await()["tracks"].list().map(::normalizeTrack)
            val albums: List<AlbumInfo> = releases.await()["albums"].list()
                .mapNotNull(::normalizeAlbumInfo)
                .sortedByDescending { it.year ?: 0 }
            val artist = info.await()["artist"]
            Collection(
                ref = ref,
                title = artist["name"].str() ?: "Исполнитель",
                subtitle = "Исполнитель",
                coverUri = coverOf(artist),
                trackCount = tracks.size,
                tracks = tracks,
                artists = emptyList(),
                albums = albums,
            )
        }
    }

    suspend fun setPin(ref: CollectionRef, pinned: Boolean) {
        val method = if (pinned) "PUT" else "DELETE"
        when (ref) {
            is CollectionRef.Playlist -> {
                if (ref.uid == null || ref.kind == null) throw YandexError("У этого плейлиста нельзя поменять закрепление")
                request("/pin/playlist", CallSpec(method, body = buildJsonObject { put("uid", ref.uid); put("kind", ref.kind) }))
            }
            is CollectionRef.AlbumRef -> request("/pin/album", CallSpec(method, body = buildJsonObject { put("id", ref.id) }))
            is CollectionRef.ArtistRef -> request("/pin/artist", CallSpec(method, body = buildJsonObject { put("id", ref.id) }))
        }
    }

    /**
     * Playlist entries usually carry the full track; the rest are fetched in batches.
     * The list keeps its order, and entries that cannot be loaded are dropped.
     */
    private suspend fun resolveTrackItems(items: List<JsonElement>): List<Track> {
        val resolved = arrayOfNulls<Track>(items.size)
        val missing = ArrayList<Pair<Int, String>>()
        items.forEachIndexed { index, item ->
            val full = item["track"]
            if (full != null) {
                resolved[index] = normalizeTrack(full)
            } else {
                val id = item["id"].str() ?: return@forEachIndexed
                val album = item["albumId"].str()
                missing += index to if (album != null) "$id:$album" else id
            }
        }
        missing.chunked(TRACKS_PER_REQUEST).forEach { batch ->
            val loaded = tracks(batch.map { it.second }).associateBy { it.id }
            batch.forEach { (index, id) -> resolved[index] = loaded[id.substringBefore(':')] }
        }
        return resolved.filterNotNull()
    }

    suspend fun waveStart(seed: String = WAVE_SEED): WaveBatch {
        val result = request(
            "/rotor/session/new",
            CallSpec(body = buildJsonObject {
                put("seeds", buildJsonArray { add(JsonPrimitive(seed)) })
                put("includeTracksInResponse", true)
            }),
        )
        return WaveBatch(
            sessionId = result["radioSessionId"].str().orEmpty(),
            batchId = result["batchId"].str().orEmpty(),
            tracks = waveTracks(result),
        )
    }

    suspend fun waveNext(sessionId: String, lastTrackId: String): WaveBatch {
        val result = request(
            "/rotor/session/$sessionId/tracks",
            CallSpec(body = buildJsonObject { put("queue", buildJsonArray { add(JsonPrimitive(lastTrackId)) }) }),
        )
        return WaveBatch(sessionId, result["batchId"].str().orEmpty(), waveTracks(result))
    }

    suspend fun waveFeedback(sessionId: String, batchId: String, type: WaveEvent, trackId: String? = null, playedSeconds: Double? = null) {
        request(
            "/rotor/session/$sessionId/feedback",
            CallSpec(body = buildJsonObject {
                put("event", buildJsonObject {
                    put("type", type.wire)
                    put("timestamp", Instant.now().toString())
                    if (trackId != null) put("trackId", trackId)
                    if (playedSeconds != null) put("totalPlayedSeconds", playedSeconds)
                })
                put("batchId", batchId)
                put("from", "radio-mobile-user-onyourwave")
            }),
        )
    }

    private fun waveTracks(result: JsonElement?): List<Track> =
        result["sequence"].list().filter { it["type"].str() == "track" && it["track"] != null }.map { normalizeTrack(it["track"]) }
}
