package app.trashee

import app.trashee.player.Biquad
import app.trashee.player.BiquadKind
import app.trashee.player.EQ_BANDS
import app.trashee.player.EQ_LIMIT_DB
import app.trashee.player.EQ_PRESETS
import app.trashee.player.EqualizerFilter
import app.trashee.player.biquad
import app.trashee.player.matchingPreset
import app.trashee.player.sanitizeEqGains
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EqualizerTest {
    private val rate = 48_000

    /** Gain in dB of a filter at [frequency]: |H(e^jw)| from its coefficients. */
    private fun responseDb(c: Biquad, frequency: Double): Double {
        val w = 2 * PI * frequency / rate
        val cos1 = kotlin.math.cos(w); val sin1 = sin(w)
        val cos2 = kotlin.math.cos(2 * w); val sin2 = sin(2 * w)
        val numRe = c.b0 + c.b1 * cos1 + c.b2 * cos2
        val numIm = -(c.b1 * sin1 + c.b2 * sin2)
        val denRe = 1 + c.a1 * cos1 + c.a2 * cos2
        val denIm = -(c.a1 * sin1 + c.a2 * sin2)
        val magnitude = sqrt(numRe * numRe + numIm * numIm) / sqrt(denRe * denRe + denIm * denIm)
        return 20 * log10(magnitude)
    }

    @Test
    fun `a band at zero dB changes nothing`() {
        assertEquals(Biquad.IDENTITY, biquad(BiquadKind.Peaking, 1000.0, rate, 0.0))
    }

    @Test
    fun `a peaking band reaches its gain at its own frequency and leaves far frequencies alone`() {
        val c = biquad(BiquadKind.Peaking, 1000.0, rate, 6.0)
        assertEquals(6.0, responseDb(c, 1000.0), 0.05)
        assertTrue(abs(responseDb(c, 31.0)) < 0.3)
        assertTrue(abs(responseDb(c, 16000.0)) < 0.5)
        assertEquals(-6.0, responseDb(biquad(BiquadKind.Peaking, 1000.0, rate, -6.0), 1000.0), 0.05)
    }

    @Test
    fun `shelves lift everything beyond their corner`() {
        val low = biquad(BiquadKind.LowShelf, 62.0, rate, 6.0)
        assertTrue(responseDb(low, 20.0) > 5.0)
        assertTrue(abs(responseDb(low, 4000.0)) < 0.2)
        val high = biquad(BiquadKind.HighShelf, 8000.0, rate, 6.0)
        assertTrue(responseDb(high, 20000.0) > 5.0)
        assertTrue(abs(responseDb(high, 200.0)) < 0.2)
    }

    private fun sine(frequency: Double, seconds: Double, amplitude: Double = 8000.0): ShortArray {
        val frames = (rate * seconds).toInt()
        val data = ShortArray(frames * 2)
        for (i in 0 until frames) {
            val v = (amplitude * sin(2 * PI * frequency * i / rate)).toInt().toShort()
            data[i * 2] = v
            data[i * 2 + 1] = v
        }
        return data
    }

    private fun rms(data: ShortArray, from: Int): Double {
        var sum = 0.0
        for (i in from until data.size) sum += data[i].toDouble() * data[i]
        return sqrt(sum / (data.size - from))
    }

    @Test
    fun `a flat curve passes the sound through untouched`() {
        val filter = EqualizerFilter(rate, 2)
        filter.setGains(EQ_PRESETS.first().gains)
        assertTrue(filter.flat)
        val input = sine(1000.0, 0.2)
        val copy = input.copyOf()
        filter.process(copy, copy.size)
        assertTrue(input.contentEquals(copy))
    }

    @Test
    fun `plus six dB at one kilohertz doubles a one kilohertz tone and leaves a distant tone alone`() {
        val gains = List(EQ_BANDS.size) { if (EQ_BANDS[it] == 1000) 6f else 0f }
        val boosted = EqualizerFilter(rate, 2).apply { setGains(gains) }
        val tone = sine(1000.0, 0.5)
        val before = rms(tone, tone.size / 2)
        boosted.process(tone, tone.size)
        assertEquals(2.0, rms(tone, tone.size / 2) / before, 0.08)

        val far = sine(60.0, 0.5)
        val farBefore = rms(far, far.size / 2)
        EqualizerFilter(rate, 2).apply { setGains(gains) }.process(far, far.size)
        assertEquals(1.0, rms(far, far.size / 2) / farBefore, 0.1)
    }

    @Test
    fun `a boost that would overflow is clipped instead of wrapping around`() {
        val gains = List(EQ_BANDS.size) { 12f }
        val loud = sine(1000.0, 0.3, amplitude = 30000.0)
        EqualizerFilter(rate, 2).apply { setGains(gains) }.process(loud, loud.size)
        assertTrue(loud.all { it in Short.MIN_VALUE..Short.MAX_VALUE })
        assertTrue(loud.maxOf { abs(it.toInt()) } > 30000)
    }

    @Test
    fun `curves are checked before use`() {
        assertEquals(EQ_PRESETS.first().gains, sanitizeEqGains(null))
        assertEquals(EQ_PRESETS.first().gains, sanitizeEqGains(listOf(1f, 2f)))
        assertEquals(EQ_PRESETS.first().gains, sanitizeEqGains(List(10) { Float.NaN }))
        assertTrue(sanitizeEqGains(List(10) { 99f }).all { it == EQ_LIMIT_DB })
        assertTrue(sanitizeEqGains(List(10) { -99f }).all { it == -EQ_LIMIT_DB })
    }

    @Test
    fun `a curve is called a preset only when it is one`() {
        assertEquals("bass", matchingPreset(EQ_PRESETS[1].gains)?.id)
        assertNull(matchingPreset(EQ_PRESETS[1].gains.mapIndexed { i, g -> if (i == 0) g + 1 else g }))
        assertNotNull(matchingPreset(EQ_PRESETS.first().gains))
    }

    @Test
    fun `presets match the desktop app`() {
        assertEquals(listOf("flat", "bass", "vocal", "treble", "rock", "electronic", "acoustic"), EQ_PRESETS.map { it.id })
        assertEquals(listOf(5f, 4f, 1f, 0f, -2f, 2f, 1f, 1f, 4f, 5f), EQ_PRESETS.first { it.id == "electronic" }.gains)
        assertEquals(listOf(31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000), EQ_BANDS.toList())
    }
}
