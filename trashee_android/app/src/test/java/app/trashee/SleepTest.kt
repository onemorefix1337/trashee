package app.trashee

import app.trashee.player.SLEEP_MINUTES
import app.trashee.player.fadeLevel
import app.trashee.player.formatRemaining
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SleepTest {
    @Test
    fun `the fade starts at full volume, ends in silence and never goes back up`() {
        assertEquals(1f, fadeLevel(0, 15_000), 0f)
        assertEquals(0f, fadeLevel(15_000, 15_000), 0f)
        assertEquals(0f, fadeLevel(99_999, 15_000), 0f)
        assertEquals(1f, fadeLevel(-5, 15_000), 0f)
        var last = 1f
        for (ms in 0..15_000 step 500) {
            val level = fadeLevel(ms.toLong(), 15_000)
            assertTrue(level <= last)
            last = level
        }
    }

    @Test
    fun `the fade is gentler than a straight line at first, like on the computer`() {
        assertEquals(0.25f, fadeLevel(7_500, 15_000), 0.0001f)
        assertEquals(0f, fadeLevel(0, 0), 0f)
    }

    @Test
    fun `the time left is minutes and seconds with hours only when needed`() {
        assertEquals("0:00", formatRemaining(0))
        assertEquals("0:01", formatRemaining(999))
        assertEquals("30:00", formatRemaining(30 * 60 * 1000L))
        assertEquals("1:01", formatRemaining(61_000))
        assertEquals("1:05:05", formatRemaining(65 * 60 * 1000L + 5000))
        assertEquals("0:00", formatRemaining(-4000))
    }

    @Test
    fun `choices go from short to long`() {
        assertEquals(SLEEP_MINUTES.sorted(), SLEEP_MINUTES)
    }
}
