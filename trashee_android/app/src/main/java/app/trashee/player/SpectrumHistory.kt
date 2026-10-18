package app.trashee.player

/**
 * The last few hundred measurements of the sound with the time each was made. The player measures sound as it
 * hands it to the audio output, which is up to a quarter of a second before it is heard; the bars are drawn from
 * the measurement that was made that long ago instead of the newest one, so they move with what is heard.
 */
class SpectrumHistory(private val capacity: Int = 192) {
    private val times = LongArray(capacity)
    private val frames = arrayOfNulls<FloatArray>(capacity)
    private var head = 0
    private var size = 0
    private val lock = Any()

    /** Called from the audio thread for every measurement. */
    fun add(timeNanos: Long, bands: FloatArray) = synchronized(lock) {
        times[head] = timeNanos
        frames[head] = bands
        head = (head + 1) % capacity
        if (size < capacity) size += 1
    }

    /** The newest measurement made at or before [timeNanos]; null when there is none (yet, or any longer). */
    fun at(timeNanos: Long): FloatArray? = synchronized(lock) {
        var found: FloatArray? = null
        var foundTime = Long.MIN_VALUE
        for (i in 0 until size) {
            val index = (head - 1 - i + capacity) % capacity
            // Newest first: the first one that is old enough is the answer.
            if (times[index] <= timeNanos) {
                found = frames[index]
                foundTime = times[index]
                break
            }
        }
        // A measurement from long ago is no answer: the sound has stopped or been cut.
        if (found != null && timeNanos - foundTime > STALE_NANOS) null else found
    }

    fun clear() = synchronized(lock) {
        size = 0
        head = 0
    }

    private companion object {
        const val STALE_NANOS = 400_000_000L
    }
}
