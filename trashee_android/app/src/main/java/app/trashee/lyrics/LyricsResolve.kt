package app.trashee.lyrics

import app.trashee.data.Lyrics
import app.trashee.data.LyricsQuery
import app.trashee.data.LyricsSource

val YANDEX_SOURCE = LyricsSource("Яндекс Музыка")
val LRCLIB_SOURCE = LyricsSource("LRCLIB", "https://lrclib.net")
val OVH_SOURCE = LyricsSource("lyrics.ovh", "https://lyrics.ovh")

interface LyricsProvider {
    /** Plain-text-only sources are not asked once some plain text is already in hand. */
    val canSync: Boolean

    suspend fun find(query: LyricsQuery): Lyrics?
}

/**
 * Yandex first. Its synced text is final; plain text, or none, sends the search on to open sources, in order.
 * Synced text from anywhere beats plain text; plain text from Yandex beats plain text from the rest.
 * When Yandex itself failed and nothing else had a text, the failure is passed on so the player can offer a retry.
 */
suspend fun resolveLyrics(
    query: LyricsQuery,
    yandex: suspend () -> Lyrics,
    providers: List<LyricsProvider>,
): Lyrics {
    var failure: Throwable? = null
    val own = try {
        yandex()
    } catch (error: kotlinx.coroutines.CancellationException) {
        throw error
    } catch (error: Throwable) {
        failure = error
        null
    }
    if (own?.synced != null) return own

    var best: Lyrics? = own?.takeIf { it.hasText }
    var instrumental = false
    for (provider in providers) {
        // With some text in hand, only a source that may have it synced is worth asking.
        if (best != null && !provider.canSync) continue
        val found = try {
            provider.find(query)
        } catch (error: kotlinx.coroutines.CancellationException) {
            throw error
        } catch (error: Throwable) {
            null
        }
        if (found?.instrumental == true) instrumental = true
        if (found == null || !found.hasText) continue
        if (found.synced != null) return found
        if (best == null) best = found
    }

    best?.let { return it }
    failure?.let { throw it }
    return if (instrumental) Lyrics(null, null, LRCLIB_SOURCE, instrumental = true) else Lyrics.None
}

