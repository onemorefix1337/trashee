package app.trashee.lyrics

import kotlin.math.abs

/** A track as an open lyrics database describes it. */
data class LyricsCandidate(
    val trackName: String,
    val artistName: String,
    /** Seconds. */
    val duration: Double?,
    val instrumental: Boolean,
    val plainLyrics: String?,
    val syncedLyrics: String?,
)

// The length of a track differs a little between releases; more than this is a different recording.
private const val DURATION_TOLERANCE_SEC = 4.0

private val BRACKETS = Regex("[(\\[{][^)\\]}]*[)\\]}]")
private val VERSION_TAIL = Regex("\\s[-–—]\\s(?:.*\\b)?(?:remaster(?:ed)?|live|version|mix|edit|radio|deluxe|bonus)\\b.*$")
private val FEATURING = Regex("\\b(?:feat|ft|featuring)\\b\\.?.*$")
private val NOT_WORD = Regex("[^\\p{L}\\p{N}]+")

/** Lowercase words only: no "(feat. ...)", "- Remastered", punctuation, or accents on "ё". */
fun normalizeTitle(title: String): String =
    title.lowercase()
        .replace('ё', 'е')
        .replace(BRACKETS, " ")
        .replace(VERSION_TAIL, " ")
        .replace(FEATURING, " ")
        .replace(NOT_WORD, " ")
        .trim()

private fun normalizeName(name: String): String = normalizeTitle(name.replace(Regex("[&,;]"), " "))

private fun sameArtist(candidate: String, wanted: List<String>): Boolean {
    val have = normalizeName(candidate)
    if (have.isEmpty()) return false
    return wanted.any { artist ->
        val want = normalizeName(artist)
        want.isNotEmpty() && (have.contains(want) || want.contains(have))
    }
}

/** The best candidate for the wanted track, or null when nothing really is that track. Synced text wins ties. */
fun pickBest(candidates: List<LyricsCandidate>, title: String, artists: List<String>, durationSec: Double): LyricsCandidate? {
    val wantedTitle = normalizeTitle(title)
    if (wantedTitle.isEmpty()) return null

    val matching = candidates.filter { candidate ->
        if (normalizeTitle(candidate.trackName) != wantedTitle) return@filter false
        if (!sameArtist(candidate.artistName, artists)) return@filter false
        if (candidate.duration != null && durationSec > 0) {
            abs(candidate.duration - durationSec) <= DURATION_TOLERANCE_SEC
        } else {
            true
        }
    }

    fun rank(candidate: LyricsCandidate): Double {
        val gap = if (candidate.duration != null) abs(candidate.duration - durationSec) else DURATION_TOLERANCE_SEC
        val content = when {
            !candidate.syncedLyrics.isNullOrEmpty() -> 0
            !candidate.plainLyrics.isNullOrEmpty() -> 100
            else -> 200
        }
        return content + gap
    }
    return matching.minByOrNull(::rank)
}
