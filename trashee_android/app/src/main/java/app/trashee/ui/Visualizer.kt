package app.trashee.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.unit.dp
import app.trashee.player.SPECTRUM_BANDS

/**
 * How fast a bar rises and falls: the share of the way to the new level (rising) or of its height (falling) per update, of which
 * there are about 60 a second. The measurements are smoothed once more before this, so the bars calm down without lagging behind the beat.
 */
private const val RELEASE = 0.9f
private const val ATTACK = 0.3f
private const val SETTLED = 0.01f

/**
 * The bars change about sixty times a second even on a 120 Hz screen: the measurement itself is no finer,
 * and drawing every screen refresh made the whole player page miss its frames.
 */
private const val MIN_STEP_NANOS = 14_000_000L

/** Spectrum bars along the bottom edge, tinted with the accent color; they fall back when the music stops. */
@Composable
fun SpectrumBars(read: () -> FloatArray?, playing: Boolean, modifier: Modifier = Modifier) {
    val accent = LocalAccent.current
    val levels = remember { FloatArray(SPECTRUM_BANDS) }
    val path = remember { Path() }
    var frame by remember { mutableLongStateOf(0L) }

    LaunchedEffect(playing) {
        var last = 0L
        while (true) {
            val now = androidx.compose.runtime.withFrameNanos { it }
            if (now - last < MIN_STEP_NANOS) continue
            last = now
            val measured = if (playing) read() else null
            var peak = 0f
            for (i in levels.indices) {
                val target = measured?.getOrNull(i) ?: 0f
                levels[i] = if (target > levels[i]) levels[i] + (target - levels[i]) * ATTACK else levels[i] * RELEASE
                peak = maxOf(peak, levels[i])
            }
            frame = now
            // Nothing left to animate: stop spending frames until the music plays again.
            if (!playing && peak < SETTLED) break
        }
    }

    Canvas(modifier.fillMaxSize()) {
        @Suppress("UNUSED_EXPRESSION") frame // reading it here redraws the canvas on every step
        val step = size.width / SPECTRUM_BANDS
        val barWidth = step * 0.62f
        val corner = CornerRadius(barWidth / 2)
        val minimum = 3.dp.toPx()
        // All bars are one shape with one gradient: one draw call instead of one per bar.
        path.rewind()
        for (i in levels.indices) {
            val height = (levels[i] * size.height * 0.95f).coerceAtLeast(minimum)
            val left = i * step + (step - barWidth) / 2
            path.addRoundRect(RoundRect(left, size.height - height, left + barWidth, size.height, corner))
        }
        drawPath(path, Brush.verticalGradient(listOf(accent.copy(alpha = 0.6f), Color.Transparent)))
    }
}
