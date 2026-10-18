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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import app.trashee.player.SPECTRUM_BANDS

private const val RELEASE = 0.88f
private const val SETTLED = 0.01f

/** Spectrum bars along the bottom edge, tinted with the accent color; they fall back when the music stops. */
@Composable
fun SpectrumBars(read: () -> FloatArray, playing: Boolean, modifier: Modifier = Modifier) {
    val accent = LocalAccent.current
    val levels = remember { FloatArray(SPECTRUM_BANDS) }
    var frame by remember { mutableLongStateOf(0L) }

    LaunchedEffect(playing) {
        while (true) {
            androidx.compose.runtime.withFrameNanos { frame = it }
            val measured = if (playing) read() else null
            var peak = 0f
            for (i in levels.indices) {
                val target = measured?.getOrNull(i) ?: 0f
                levels[i] = maxOf(target, levels[i] * RELEASE)
                peak = maxOf(peak, levels[i])
            }
            // Nothing left to animate: stop spending frames until the music plays again.
            if (!playing && peak < SETTLED) break
        }
    }

    Canvas(modifier.fillMaxSize()) {
        @Suppress("UNUSED_EXPRESSION") frame // reading it here redraws the canvas each frame
        val step = size.width / SPECTRUM_BANDS
        val barWidth = step * 0.62f
        val fill = Brush.verticalGradient(listOf(accent.copy(alpha = 0.6f), Color.Transparent))
        for (i in levels.indices) {
            val height = (levels[i] * size.height * 0.95f).coerceAtLeast(3.dp.toPx())
            drawRoundRect(
                brush = fill,
                topLeft = Offset(i * step + (step - barWidth) / 2, size.height - height),
                size = Size(barWidth, height),
                cornerRadius = CornerRadius(barWidth / 2),
            )
        }
    }
}
