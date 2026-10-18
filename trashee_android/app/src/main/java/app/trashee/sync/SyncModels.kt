package app.trashee.sync

import app.trashee.data.Track
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** The shapes the computer and the phone exchange; the same ones as src/shared/sync.ts. */

@Serializable
data class SyncTrack(
    val id: String,
    val title: String,
    val artist: String,
    val coverUri: String? = null,
    val durationMs: Long = 0,
    val albumId: Long? = null,
)

/** What one device is playing. [at] is the clock of the computer when [positionMs] was true. */
@Serializable
data class NowPlaying(
    val device: String = "",
    val name: String = "",
    val track: SyncTrack? = null,
    val playing: Boolean = false,
    val positionMs: Long = 0,
    val at: Long = 0,
    val queueLength: Int = 0,
    val index: Int = 0,
)

/** A whole listening session handed over: the queue as track ids, where in it, and how far into the track. */
@Serializable
data class Handoff(
    val from: String = "",
    val fromName: String = "",
    val queue: List<String>,
    val index: Int = 0,
    val positionMs: Long = 0,
    val at: Long = 0,
    val playing: Boolean = true,
    val tracks: List<SyncTrack> = emptyList(),
)

@Serializable
data class SyncCommand(val cmd: String, val value: Double? = null)

@Serializable
data class DeviceRef(val id: String, val name: String)

@Serializable
data class DeviceStatus(
    val id: String,
    val name: String,
    val platform: String = "",
    val online: Boolean = false,
    val state: NowPlaying? = null,
)

/** The computer this phone is paired with. */
@Serializable
data class Pairing(
    val serverId: String,
    val serverName: String,
    /** "ip:port"; found again by [serverId] if the router hands the computer another address. */
    val address: String,
    val token: String,
    val deviceId: String,
)

val syncJson = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }

const val HANDOFF_BEHIND = 5
const val HANDOFF_AHEAD = 150
const val HANDOFF_INLINE = 3

fun Track.toSync() = SyncTrack(id, title, artistNames, coverUri, durationMs, albums.firstOrNull()?.id)

/** The part of a queue that goes along in a handoff: what was just played and what comes next. */
fun <T> handoffWindow(queue: List<T>, index: Int): Pair<List<T>, Int> {
    val from = maxOf(0, index - HANDOFF_BEHIND)
    return queue.drop(from).take(index + HANDOFF_AHEAD + 1 - from) to (index - from)
}

/** Where a track is now, given a state sent a moment ago: it keeps moving while it plays. [clockOffsetMs] is computer clock minus phone clock. */
fun estimatePositionMs(state: NowPlaying, nowMs: Long, clockOffsetMs: Long = 0): Long {
    val track = state.track ?: return 0
    val moved = if (state.playing) maxOf(0L, nowMs + clockOffsetMs - state.at) else 0L
    val position = state.positionMs + moved
    return if (track.durationMs > 0) minOf(position, track.durationMs) else position
}
