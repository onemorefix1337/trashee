package app.trashee.player

import android.content.Context
import app.trashee.data.Track
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

/** How many tracks of a long queue are kept: the ones around the current, so a day-long playlist stays small. */
private const val KEPT_BEHIND = 10
private const val KEPT_TOTAL = 300

@Serializable
private class KeptQueue(val tracks: List<Track>)

/** What was playing when the app was closed: where in the queue and how far into the track, with the shuffle and repeat. */
class Remembered(val tracks: List<Track>, val index: Int, val positionMs: Long, val shuffle: Boolean, val repeat: Int)

/**
 * The queue goes to a file, because it changes rarely and can be long; the place in it goes to preferences, because
 * that is written every few seconds. The place is counted from where the kept part of the queue begins.
 */
class PlaybackMemory(context: Context) {
    private val file = File(context.filesDir, "playback.json")
    private val prefs = context.getSharedPreferences("playback", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    /** Encodes now, writes where the caller says (a background thread, normally); the place counts from the kept part. */
    fun saveQueue(queue: List<Track>, index: Int, write: (() -> Unit) -> Unit) {
        if (queue.isEmpty()) return
        val from = (index - KEPT_BEHIND).coerceAtLeast(0).coerceAtMost((queue.size - KEPT_TOTAL).coerceAtLeast(0))
        val kept = queue.subList(from, minOf(queue.size, from + KEPT_TOTAL)).toList()
        prefs.edit().putInt("keptFrom", from).apply()
        val text = json.encodeToString(KeptQueue.serializer(), KeptQueue(kept))
        write {
            val temp = File(file.parentFile, "playback.json.tmp")
            temp.writeText(text)
            if (!temp.renameTo(file)) {
                file.delete()
                temp.renameTo(file)
            }
        }
    }

    fun savePlace(index: Int, positionMs: Long, shuffle: Boolean, repeat: Int) {
        prefs.edit()
            .putInt("index", (index - prefs.getInt("keptFrom", 0)).coerceAtLeast(0))
            .putLong("positionMs", positionMs.coerceAtLeast(0))
            .putBoolean("shuffle", shuffle)
            .putInt("repeat", repeat)
            .apply()
    }

    fun load(): Remembered? {
        val kept = runCatching { json.decodeFromString(KeptQueue.serializer(), file.readText()).tracks }.getOrNull()
        if (kept.isNullOrEmpty()) return null
        val index = prefs.getInt("index", 0).coerceIn(0, kept.size - 1)
        return Remembered(
            kept, index, prefs.getLong("positionMs", 0), prefs.getBoolean("shuffle", false), prefs.getInt("repeat", 0),
        )
    }

    /** Playback was ended on purpose (signing out): there is nothing to continue. */
    fun forget() {
        file.delete()
        prefs.edit().clear().apply()
    }
}
