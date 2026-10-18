@file:OptIn(UnstableApi::class)

package app.trashee.player

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** The same ten bands, limits and presets as the desktop app, so a setting means the same on both. */
val EQ_BANDS = intArrayOf(31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000)
const val EQ_LIMIT_DB = 12f

data class EqPreset(val id: String, val label: String, val gains: List<Float>)

private fun gains(vararg values: Int) = values.map { it.toFloat() }

val EQ_PRESETS = listOf(
    EqPreset("flat", "Плоский", gains(0, 0, 0, 0, 0, 0, 0, 0, 0, 0)),
    EqPreset("bass", "Бас", gains(6, 5, 4, 2, 0, 0, 0, 0, 0, 0)),
    EqPreset("vocal", "Вокал", gains(-2, -2, -1, 1, 3, 4, 3, 1, 0, -1)),
    EqPreset("treble", "Высокие", gains(0, 0, 0, 0, 0, 1, 3, 4, 5, 6)),
    EqPreset("rock", "Рок", gains(4, 3, 2, -1, -2, -1, 2, 3, 4, 4)),
    EqPreset("electronic", "Электроника", gains(5, 4, 1, 0, -2, 2, 1, 1, 4, 5)),
    EqPreset("acoustic", "Акустика", gains(3, 3, 2, 1, 1, 1, 2, 2, 3, 2)),
)

/** What a list of gains must look like to be used: ten numbers, each inside the limit. Anything else is a flat curve. */
fun sanitizeEqGains(raw: List<Float>?): List<Float> =
    if (raw != null && raw.size == EQ_BANDS.size && raw.all { it.isFinite() }) {
        raw.map { it.coerceIn(-EQ_LIMIT_DB, EQ_LIMIT_DB) }
    } else {
        EQ_PRESETS.first().gains
    }

/** The preset a curve matches exactly, or null for a hand-made one. */
fun matchingPreset(gains: List<Float>): EqPreset? = EQ_PRESETS.firstOrNull { it.gains == gains }

enum class BiquadKind { LowShelf, Peaking, HighShelf }

/** Coefficients of one filter, already divided by a0. */
data class Biquad(val b0: Double, val b1: Double, val b2: Double, val a1: Double, val a2: Double) {
    companion object {
        val IDENTITY = Biquad(1.0, 0.0, 0.0, 0.0, 0.0)
    }
}

/** The formulas of the Web Audio BiquadFilterNode, which the desktop equalizer uses, so both sound alike. */
fun biquad(kind: BiquadKind, frequency: Double, sampleRate: Int, gainDb: Double, q: Double = 1.0): Biquad {
    if (gainDb == 0.0) return Biquad.IDENTITY
    val a = 10.0.pow(gainDb / 40)
    val w0 = 2 * PI * (frequency / sampleRate).coerceIn(1e-6, 0.499)
    val cosW = cos(w0)
    val sinW = sin(w0)
    val b0: Double; val b1: Double; val b2: Double; val a0: Double; val a1: Double; val a2: Double
    when (kind) {
        BiquadKind.Peaking -> {
            val alpha = sinW / (2 * q)
            b0 = 1 + alpha * a; b1 = -2 * cosW; b2 = 1 - alpha * a
            a0 = 1 + alpha / a; a1 = -2 * cosW; a2 = 1 - alpha / a
        }
        BiquadKind.LowShelf -> {
            val k2 = 2 * sqrt(a) * (sinW / 2 * sqrt(2.0))
            b0 = a * ((a + 1) - (a - 1) * cosW + k2)
            b1 = 2 * a * ((a - 1) - (a + 1) * cosW)
            b2 = a * ((a + 1) - (a - 1) * cosW - k2)
            a0 = (a + 1) + (a - 1) * cosW + k2
            a1 = -2 * ((a - 1) + (a + 1) * cosW)
            a2 = (a + 1) + (a - 1) * cosW - k2
        }
        BiquadKind.HighShelf -> {
            val k2 = 2 * sqrt(a) * (sinW / 2 * sqrt(2.0))
            b0 = a * ((a + 1) + (a - 1) * cosW + k2)
            b1 = -2 * a * ((a - 1) + (a + 1) * cosW)
            b2 = a * ((a + 1) + (a - 1) * cosW - k2)
            a0 = (a + 1) - (a - 1) * cosW + k2
            a1 = 2 * ((a - 1) - (a + 1) * cosW)
            a2 = (a + 1) - (a - 1) * cosW - k2
        }
    }
    return Biquad(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
}

/** Ten filters in a row for interleaved 16-bit audio; bands left at 0 dB cost nothing. */
class EqualizerFilter(private val sampleRate: Int, private val channels: Int) {
    private val count = EQ_BANDS.size
    private var coefficients = Array(count) { Biquad.IDENTITY }
    private var active = IntArray(0)
    private val x1 = Array(channels) { DoubleArray(count) }
    private val x2 = Array(channels) { DoubleArray(count) }
    private val y1 = Array(channels) { DoubleArray(count) }
    private val y2 = Array(channels) { DoubleArray(count) }

    /** True while every band is at 0 dB, so the sound can go through untouched. */
    var flat = true
        private set

    /** The filter memory is kept, so changing a gain while playing does not click. */
    fun setGains(gains: List<Float>) {
        coefficients = Array(count) { band ->
            val kind = when (band) {
                0 -> BiquadKind.LowShelf
                count - 1 -> BiquadKind.HighShelf
                else -> BiquadKind.Peaking
            }
            biquad(kind, EQ_BANDS[band].toDouble(), sampleRate, (gains.getOrNull(band) ?: 0f).toDouble())
        }
        active = (0 until count).filter { coefficients[it] !== Biquad.IDENTITY }.toIntArray()
        flat = active.isEmpty()
    }

    /** Filters [length] interleaved samples of [samples] in place. */
    fun process(samples: ShortArray, length: Int) {
        if (flat) return
        var index = 0
        while (index + channels <= length) {
            for (channel in 0 until channels) {
                var value = samples[index + channel].toDouble()
                for (band in active) {
                    val c = coefficients[band]
                    val out = c.b0 * value + c.b1 * x1[channel][band] + c.b2 * x2[channel][band] -
                        c.a1 * y1[channel][band] - c.a2 * y2[channel][band]
                    x2[channel][band] = x1[channel][band]
                    x1[channel][band] = value
                    y2[channel][band] = y1[channel][band]
                    y1[channel][band] = out
                    value = out
                }
                samples[index + channel] = value.coerceIn(Short.MIN_VALUE.toDouble(), Short.MAX_VALUE.toDouble()).toInt().toShort()
            }
            index += channels
        }
    }

    fun reset() {
        for (channel in 0 until channels) {
            x1[channel].fill(0.0); x2[channel].fill(0.0); y1[channel].fill(0.0); y2[channel].fill(0.0)
        }
    }
}

/** Puts the equalizer into the audio path of the player, in front of the spectrum measurement. */
class EqualizerProcessor : BaseAudioProcessor() {
    @Volatile
    private var wanted: List<Float> = EQ_PRESETS.first().gains
    private var applied: List<Float>? = null
    private var filter: EqualizerFilter? = null
    private var scratch = ShortArray(0)
    private var channels = 2

    /** Safe to call from any thread; the audio thread picks it up with the next buffer. */
    fun setGains(gains: List<Float>) {
        wanted = sanitizeEqGains(gains)
    }

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        channels = inputAudioFormat.channelCount.coerceAtLeast(1)
        filter = EqualizerFilter(inputAudioFormat.sampleRate, channels)
        applied = null
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val remaining = inputBuffer.remaining()
        if (remaining == 0) return
        val filter = filter
        val gains = wanted
        if (filter != null && applied !== gains) {
            filter.setGains(gains)
            applied = gains
        }
        val output = replaceOutputBuffer(remaining)
        if (filter == null || filter.flat) {
            output.put(inputBuffer)
        } else {
            val shorts = remaining / 2
            if (scratch.size < shorts) scratch = ShortArray(shorts)
            inputBuffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(scratch, 0, shorts)
            filter.process(scratch, shorts)
            output.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(scratch, 0, shorts)
            output.position(output.position() + shorts * 2)
            inputBuffer.position(inputBuffer.limit())
        }
        output.flip()
    }

    override fun onFlush() {
        filter?.reset()
    }

    override fun onReset() {
        filter = null
        applied = null
    }
}
