package app.trashee.player

/** Choices of the sleep timer, in minutes. */
val SLEEP_MINUTES = listOf(15, 30, 45, 60, 90)

/** The music fades out over this long before the timer stops it. */
const val SLEEP_FADE_MS = 15_000L

/**
 * How loud the music is [elapsedMs] into a fade of [totalMs], as a share of where it started. It falls with the square
 * of the time left, which sounds even to the ear; a straight line seems to drop at the end. Same as on the computer.
 */
fun fadeLevel(elapsedMs: Long, totalMs: Long): Float {
    if (totalMs <= 0) return 0f
    val left = (1f - elapsedMs.toFloat() / totalMs).coerceIn(0f, 1f)
    return left * left
}

/** "12:30" below an hour, "1:05:00" from an hour; never negative. */
fun formatRemaining(ms: Long): String {
    val seconds = (maxOf(ms, 0L) + 999) / 1000
    val hours = seconds / 3600
    val minutes = seconds % 3600 / 60
    val rest = (seconds % 60).toString().padStart(2, '0')
    return if (hours > 0) "$hours:${minutes.toString().padStart(2, '0')}:$rest" else "$minutes:$rest"
}

sealed interface Sleep {
    data object Off : Sleep
    data class Timer(val remainingMs: Long) : Sleep
    data object AfterTrack : Sleep
}
