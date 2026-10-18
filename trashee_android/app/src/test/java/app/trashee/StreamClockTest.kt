package app.trashee

import app.trashee.player.StreamClock
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StreamClockTest {
    private val rate = 44_100
    private val hop = 512L
    private val hopNanos = hop * 1_000_000_000L / rate
    private val ms = 1_000_000L

    @Test
    fun `measurements made in one lump are spread over the time their sound takes`() {
        val clock = StreamClock(rate)
        val now = 5_000 * ms
        val stamps = (1..8).map { clock.stamp(now, it * hop) }
        for (i in 1 until stamps.size) {
            val step = stamps[i] - stamps[i - 1]
            assertTrue("step $i was ${step / 1000} us", kotlin.math.abs(step - hopNanos) < 700_000)
        }
        assertTrue(stamps.last() - stamps.first() > 6 * hopNanos)
    }

    @Test
    fun `lump after lump gives a steady beat, not a staircase`() {
        val clock = StreamClock(rate)
        val stamps = ArrayList<Long>()
        var frames = 0L
        var wall = 1_000 * ms
        repeat(30) {
            repeat(8) {
                frames += hop
                stamps += clock.stamp(wall, frames)
            }
            wall += 8 * hopNanos
        }
        val steps = stamps.zipWithNext { a, b -> b - a }
        assertTrue("never goes back", steps.all { it > 0 })
        assertTrue("never stalls or leaps", steps.all { kotlin.math.abs(it - hopNanos) < 1_000_000 })
    }

    @Test
    fun `after a pause the stream starts over at the moment the sound comes back`() {
        val clock = StreamClock(rate)
        var frames = 0L
        repeat(10) { frames += hop; clock.stamp(1_000 * ms + it * hopNanos, frames) }
        frames += hop
        val resumed = clock.stamp(9_000 * ms, frames)
        assertEquals(9_000 * ms, resumed)
    }

    @Test
    fun `a cut also starts over`() {
        val clock = StreamClock(rate)
        clock.stamp(1_000 * ms, hop)
        clock.reset()
        assertEquals(2_000 * ms, clock.stamp(2_000 * ms, hop * 3))
    }
}
