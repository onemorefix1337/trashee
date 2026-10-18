package app.trashee

import app.trashee.player.SpectrumHistory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SpectrumHistoryTest {
    private fun frame(value: Float) = floatArrayOf(value)
    private val ms = 1_000_000L

    @Test
    fun `the newest measurement made at or before the asked time is the answer`() {
        val history = SpectrumHistory()
        history.add(100 * ms, frame(1f))
        history.add(112 * ms, frame(2f))
        history.add(124 * ms, frame(3f))
        assertEquals(2f, history.at(120 * ms)!![0], 0f)
        assertEquals(3f, history.at(124 * ms)!![0], 0f)
        assertEquals(3f, history.at(130 * ms)!![0], 0f)
        assertEquals(1f, history.at(105 * ms)!![0], 0f)
    }

    @Test
    fun `before the first measurement there is nothing to show`() {
        val history = SpectrumHistory()
        assertNull(history.at(50 * ms))
        history.add(100 * ms, frame(1f))
        assertNull(history.at(99 * ms))
    }

    @Test
    fun `a measurement from long ago is no answer once the sound has stopped`() {
        val history = SpectrumHistory()
        history.add(100 * ms, frame(1f))
        assertNull(history.at(100 * ms + 500 * ms))
        assertEquals(1f, history.at(100 * ms + 300 * ms)!![0], 0f)
    }

    @Test
    fun `old measurements make way for new ones`() {
        val history = SpectrumHistory(capacity = 4)
        for (i in 1..10) history.add(i * 10 * ms, frame(i.toFloat()))
        assertEquals(10f, history.at(110 * ms)!![0], 0f)
        assertEquals(7f, history.at(75 * ms)!![0], 0f)
        // Measurements 1 to 6 were pushed out, so a time before 7 has no answer.
        assertNull(history.at(65 * ms))
    }

    @Test
    fun `clearing forgets everything, as a seek must`() {
        val history = SpectrumHistory()
        history.add(100 * ms, frame(1f))
        history.clear()
        assertNull(history.at(150 * ms))
        history.add(200 * ms, frame(5f))
        assertEquals(5f, history.at(210 * ms)!![0], 0f)
    }
}
