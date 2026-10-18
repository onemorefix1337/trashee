package app.trashee.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private val BAR_HEIGHTS = listOf(0.40f, 0.72f, 1f, 0.60f, 0.32f)

/** The five bars of the logo; they breathe when [animated]. */
@Composable
fun Logo(size: Dp = 72.dp, animated: Boolean = false, modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "logo")
    val scales = listOf(900, 1100, 1300, 1000, 1200).mapIndexed { i, duration ->
        transition.animateFloat(
            if (animated) 0.7f else 1f, 1f,
            infiniteRepeatable(tween(duration), RepeatMode.Reverse),
            label = "bar$i",
        )
    }
    Canvas(modifier.size(size)) {
        val gap = this.size.width * 0.07f
        val barWidth = (this.size.width - gap * 4) / 5
        val brush = Brush.verticalGradient(
            listOf(Color(0xFFFF6B8B), Color(0xFFFF9A62), Color(0xFF8F6BFF)),
        )
        BAR_HEIGHTS.forEachIndexed { i, fraction ->
            val height = this.size.height * fraction * scales[i].value
            drawRoundRect(
                brush = brush,
                topLeft = Offset(i * (barWidth + gap), (this.size.height - height) / 2),
                size = Size(barWidth, height),
                cornerRadius = CornerRadius(barWidth / 2),
            )
        }
    }
}
