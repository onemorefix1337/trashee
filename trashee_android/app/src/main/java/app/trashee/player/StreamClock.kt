package app.trashee.player

/**
 * Puts the measurements of a stream in even time order. The player hands sound to the audio output in lumps: a
 * lump of 4096 samples is measured in a few microseconds as eight measurements, then nothing happens for a tenth of a
 * second. Stamped with the moment they were made, the eight would share one time and the bars would stand still, then
 * jump. A measurement belongs where its sample lies in the stream, so its time is the start of the stream plus
 * the length of the stream so far; the start is learned as a running average of (moment made minus length so far),
 * which evens out the lumps.
 */
class StreamClock(private val sampleRate: Int) {
    private var anchor = 0L
    private var anchored = false
    private var lastNanos = 0L

    /** The time to give a measurement made at [nowNanos] of the sound that ends [framesSoFar] samples into the stream. */
    fun stamp(nowNanos: Long, framesSoFar: Long): Long {
        val streamNanos = framesSoFar * 1_000_000_000L / sampleRate
        val observed = nowNanos - streamNanos
        // After a pause or a cut the stream starts over in time: forget the old average at once.
        if (!anchored || nowNanos - lastNanos > GAP_NANOS) {
            anchor = observed
            anchored = true
        } else {
            anchor += ((observed - anchor) * SMOOTHING).toLong()
        }
        lastNanos = nowNanos
        return anchor + streamNanos
    }

    fun reset() {
        anchored = false
    }

    private companion object {
        /** No measurement for this long means the sound stopped (pause, seek, end of track). */
        const val GAP_NANOS = 400_000_000L
        /** Small, so that the lumps (which pull the average up and down) move the beat by a fraction of a millisecond. */
        const val SMOOTHING = 0.005
    }
}
