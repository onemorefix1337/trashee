package app.trashee.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.player.EQ_BANDS
import app.trashee.player.EQ_LIMIT_DB
import app.trashee.player.EQ_PRESETS
import app.trashee.player.matchingPreset
import kotlin.math.roundToInt

private val BAND_HEIGHT = 150.dp
private const val STEP_DB = 0.5f

private fun bandLabel(hz: Int) = if (hz >= 1000) "${hz / 1000}k" else "$hz"

private fun signed(db: Float): String {
    val rounded = (db * 2).roundToInt() / 2f
    return when {
        rounded > 0 -> "+${if (rounded % 1f == 0f) rounded.toInt() else rounded}"
        rounded < 0 -> "${if (rounded % 1f == 0f) rounded.toInt() else rounded}"
        else -> "0"
    }
}

/** One vertical slider: drag or tap to set the gain, double tap to bring the band back to 0. */
@Composable
private fun EqBand(hz: Int, gain: Float, accent: Color, onChange: (Float) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(signed(gain), color = Palette.Muted, fontSize = 11.sp)
        Canvas(
            Modifier
                .width(32.dp)
                .height(BAND_HEIGHT)
                .semantics { contentDescription = "Полоса ${bandLabel(hz)} Гц, ${signed(gain)} дБ" }
                .pointerInput(Unit) {
                    fun at(y: Float): Float {
                        val share = (1f - y / size.height).coerceIn(0f, 1f)
                        val db = (share * 2f - 1f) * EQ_LIMIT_DB
                        return (db / STEP_DB).roundToInt() * STEP_DB
                    }
                    detectDragGestures { change, _ ->
                        change.consume()
                        onChange(at(change.position.y))
                    }
                }
                .pointerInput(Unit) {
                    detectTapGestures(
                        onTap = { onChange(((1f - it.y / size.height).coerceIn(0f, 1f) * 2f - 1f).let { s -> (s * EQ_LIMIT_DB / STEP_DB).roundToInt() * STEP_DB }) },
                        onDoubleTap = { onChange(0f) },
                    )
                },
        ) {
            val trackWidth = 6.dp.toPx()
            val x = size.width / 2
            val middle = size.height / 2
            drawRoundRect(Palette.SurfaceHover, Offset(x - trackWidth / 2, 0f), Size(trackWidth, size.height), CornerRadius(trackWidth / 2))
            val thumbY = middle - gain / EQ_LIMIT_DB * middle
            drawRoundRect(
                accent,
                Offset(x - trackWidth / 2, minOf(thumbY, middle)),
                Size(trackWidth, kotlin.math.abs(thumbY - middle).coerceAtLeast(1f)),
                CornerRadius(trackWidth / 2),
            )
            drawCircle(Color.White, 9.dp.toPx(), Offset(x, thumbY))
        }
        Text(bandLabel(hz), color = Palette.Muted, fontSize = 11.sp)
    }
}

/** Presets and ten band sliders; the same bands and presets as on the computer. */
@Composable
fun EqualizerCard() {
    val app = LocalApp.current
    val gains by app.repo.eqGains.collectAsState()
    val accent = LocalAccent.current
    val preset = matchingPreset(gains)

    Card("Эквалайзер") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            EQ_PRESETS.forEach { candidate ->
                val selected = candidate.id == preset?.id
                Text(
                    candidate.label,
                    color = if (selected) Color.Black else Palette.Text,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(if (selected) accent else Palette.SurfaceHover)
                        .clickable { app.repo.setEqGains(candidate.gains) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            EQ_BANDS.forEachIndexed { band, hz ->
                EqBand(hz, gains[band], accent, onChange = { value ->
                    app.repo.setEqGains(gains.toMutableList().also { it[band] = value })
                })
            }
        }
        Text("Двойное нажатие на полосу возвращает её в ноль.", color = Palette.Muted, fontSize = 12.sp)
    }
}
