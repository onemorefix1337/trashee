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
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

const val SPECTRUM_BANDS = 48
private const val FFT_SIZE = 1024
private const val LOW_HZ = 45.0
private const val HIGH_HZ = 15_000.0
private const val FLOOR_DB = 60f

/**
 * Passes the sound through untouched and measures it on the way: log-spaced bands, 0..1, for the visualizer.
 * Needs no permission, unlike the system Visualizer, because it only looks at what this player plays.
 */
class SpectrumProcessor : BaseAudioProcessor() {
    /** The latest measurement; replaced as a whole, so readers never see half of an update. */
    @Volatile
    var bands: FloatArray = FloatArray(SPECTRUM_BANDS)
        private set

    private val window = FloatArray(FFT_SIZE) { (0.5 - 0.5 * cos(2 * PI * it / (FFT_SIZE - 1))).toFloat() }
    private val samples = FloatArray(FFT_SIZE)
    private val re = FloatArray(FFT_SIZE)
    private val im = FloatArray(FFT_SIZE)
    private var filled = 0
    private var sampleRate = 44_100
    private var channels = 2
    private var edges = IntArray(SPECTRUM_BANDS + 1)

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        // Other encodings (24-bit, float) are simply not measured.
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        sampleRate = inputAudioFormat.sampleRate
        channels = inputAudioFormat.channelCount.coerceAtLeast(1)
        val top = minOf(HIGH_HZ, sampleRate / 2.0 - 1)
        edges = IntArray(SPECTRUM_BANDS + 1) { i ->
            val hz = LOW_HZ * Math.pow(top / LOW_HZ, i.toDouble() / SPECTRUM_BANDS)
            (hz * FFT_SIZE / sampleRate).toInt().coerceIn(1, FFT_SIZE / 2 - 1)
        }
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val remaining = inputBuffer.remaining()
        if (remaining == 0) return
        val view = inputBuffer.duplicate().order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        while (view.remaining() >= channels) {
            var sum = 0
            repeat(channels) { sum += view.get() }
            push(sum / (channels * 32768f))
        }
        val output = replaceOutputBuffer(remaining)
        output.put(inputBuffer)
        output.flip()
    }

    private fun push(sample: Float) {
        samples[filled++] = sample
        if (filled == FFT_SIZE) {
            analyze()
            // Half of the window is reused, so a measurement comes every ~12 ms.
            System.arraycopy(samples, FFT_SIZE / 2, samples, 0, FFT_SIZE / 2)
            filled = FFT_SIZE / 2
        }
    }

    private fun analyze() {
        for (i in 0 until FFT_SIZE) {
            re[i] = samples[i] * window[i]
            im[i] = 0f
        }
        fft()
        val result = FloatArray(SPECTRUM_BANDS)
        for (band in 0 until SPECTRUM_BANDS) {
            val from = edges[band]
            val to = maxOf(edges[band + 1], from + 1)
            var peak = 0f
            for (bin in from until to) {
                val magnitude = sqrt(re[bin] * re[bin] + im[bin] * im[bin]) / (FFT_SIZE / 4f) // ~ amplitude of a sine
                if (magnitude > peak) peak = magnitude
            }
            val db = 20f * log10(peak + 1e-5f)
            result[band] = ((db + FLOOR_DB) / FLOOR_DB).coerceIn(0f, 1f)
        }
        bands = result
    }

    /** In-place radix-2 FFT of [re] and [im]. */
    private fun fft() {
        val n = FFT_SIZE
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while (j and bit != 0) {
                j = j xor bit
                bit = bit shr 1
            }
            j = j xor bit
            if (i < j) {
                val tr = re[i]; re[i] = re[j]; re[j] = tr
                val ti = im[i]; im[i] = im[j]; im[j] = ti
            }
        }
        var length = 2
        while (length <= n) {
            val angle = -2 * PI / length
            val wr = cos(angle).toFloat()
            val wi = sin(angle).toFloat()
            var start = 0
            while (start < n) {
                var cr = 1f
                var ci = 0f
                for (k in 0 until length / 2) {
                    val a = start + k
                    val b = a + length / 2
                    val xr = re[b] * cr - im[b] * ci
                    val xi = re[b] * ci + im[b] * cr
                    re[b] = re[a] - xr; im[b] = im[a] - xi
                    re[a] += xr; im[a] += xi
                    val next = cr * wr - ci * wi
                    ci = cr * wi + ci * wr
                    cr = next
                }
                start += length
            }
            length = length shl 1
        }
    }

    override fun onFlush() {
        filled = 0
        bands = FloatArray(SPECTRUM_BANDS)
    }

    override fun onReset() {
        onFlush()
    }
}
