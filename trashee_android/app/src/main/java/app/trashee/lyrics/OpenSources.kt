package app.trashee.lyrics

import app.trashee.BuildConfig
import app.trashee.api.parseLrc
import app.trashee.api.sharedHttp
import app.trashee.data.Lyrics
import app.trashee.data.LyricsQuery
import app.trashee.data.bool
import app.trashee.data.double
import app.trashee.data.get
import app.trashee.data.list
import app.trashee.data.str
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import okhttp3.Request

private const val LRCLIB = "https://lrclib.net/api"
private const val OVH = "https://api.lyrics.ovh/v1"
private val json = Json { ignoreUnknownKeys = true; isLenient = true }
private val openHttp = sharedHttp.newBuilder().callTimeout(6, TimeUnit.SECONDS).build()

private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

/** JSON from an open API; any failure (no network, 404, bad body) simply means "nothing here". */
private suspend fun getJson(url: String): JsonElement? = withContext(Dispatchers.IO) {
    try {
        val request = Request.Builder().url(url)
            .header("User-Agent", "trashee-android/${BuildConfig.VERSION_NAME} (https://github.com/${BuildConfig.REPO})")
            .build()
        openHttp.newCall(request).execute().use { response ->
            if (response.isSuccessful) json.parseToJsonElement(response.body.string()) else null
        }
    } catch (_: Exception) {
        null
    }
}

private fun candidateOf(raw: JsonElement?): LyricsCandidate? {
    val track = raw["trackName"].str() ?: return null
    return LyricsCandidate(
        trackName = track,
        artistName = raw["artistName"].str().orEmpty(),
        duration = raw["duration"].double(),
        instrumental = raw["instrumental"].bool() == true,
        plainLyrics = raw["plainLyrics"].str(),
        syncedLyrics = raw["syncedLyrics"].str(),
    )
}

private fun fromCandidate(candidate: LyricsCandidate): Lyrics? {
    if (candidate.instrumental) return Lyrics(null, null, LRCLIB_SOURCE, instrumental = true)
    val lines = candidate.syncedLyrics?.let(::parseLrc).orEmpty()
    if (lines.isNotEmpty()) return Lyrics(lines, null, LRCLIB_SOURCE)
    val text = candidate.plainLyrics?.trim()
    return if (text.isNullOrEmpty()) null else Lyrics(null, text, LRCLIB_SOURCE)
}

/** LRCLIB: a free community database with synced (LRC) and plain lyrics, no key needed. */
object LrclibProvider : LyricsProvider {
    override val canSync = true

    override suspend fun find(query: LyricsQuery): Lyrics? {
        val artist = query.artists.firstOrNull().orEmpty()
        val exact = buildString {
            append("track_name=${encode(query.title)}&artist_name=${encode(artist)}&duration=${Math.round(query.durationSec)}")
            query.album?.let { append("&album_name=${encode(it)}") }
        }
        candidateOf(getJson("$LRCLIB/get?$exact"))?.let { fromCandidate(it) }?.let { return it }

        // Titles and artists are spelled differently across catalogs; fall back to a search and judge the results.
        var results = getJson("$LRCLIB/search?track_name=${encode(query.title)}&artist_name=${encode(artist)}").list()
        if (results.isEmpty()) {
            results = getJson("$LRCLIB/search?q=${encode("$artist ${query.title}".trim())}").list()
        }
        val best = pickBest(results.mapNotNull(::candidateOf), query.title, query.artists, query.durationSec)
        return best?.let { fromCandidate(it) }
    }
}

/** lyrics.ovh: plain text only, patchy coverage, but a different catalog from LRCLIB. */
object OvhProvider : LyricsProvider {
    override val canSync = false

    override suspend fun find(query: LyricsQuery): Lyrics? {
        val artist = query.artists.firstOrNull() ?: return null
        if (query.title.isEmpty()) return null
        val body = getJson("$OVH/${encode(artist)}/${encode(query.title)}")
        // The service sometimes starts with a "Paroles de la chanson ..." line of its own.
        val text = body["lyrics"].str()
            ?.replace(Regex("^Paroles de la chanson[^\\n]*\\r?\\n"), "")
            ?.replace("\r\n", "\n")
            ?.trim()
        return if (text.isNullOrEmpty()) null else Lyrics(null, text, OVH_SOURCE)
    }
}

val OPEN_SOURCES: List<LyricsProvider> = listOf(LrclibProvider, OvhProvider)
