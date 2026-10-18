package app.trashee.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.trashee.data.VISUALIZER_SHIFT_MAX_MS
import app.trashee.data.VISUALIZER_SHIFT_MIN_MS

/** Lines the bars up with the sound: the player's own estimate, and a slider for what it cannot know (Bluetooth). */
@Composable
fun VisualizerCard() {
    val app = LocalApp.current
    val on by app.repo.visualizerOn.collectAsState()
    val shift by app.repo.visualizerShiftMs.collectAsState()
    val auto by app.engine.outputDelayMs.collectAsState()
    val accent = LocalAccent.current

    Card("Визуализатор") {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Показывать полоски", color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Text("На экране плеера. Выключенный, он ещё и не слушает звук, так что чуть экономит батарею.", color = Palette.Muted, fontSize = 12.sp)
            }
            Switch(
                checked = on,
                onCheckedChange = { app.repo.setVisualizerOn(it) },
                colors = SwitchDefaults.colors(checkedTrackColor = accent, checkedThumbColor = Color.Black),
            )
        }
        if (on) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Сдвиг по времени", color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f),
                )
                Text("${if (shift > 0) "+" else ""}$shift мс", color = Palette.Muted, fontSize = 14.sp)
            }
            Text(
                "Полоски опережают звук? Подвинь вправо. Отстают? Влево. Сами они уже ждут $auto мс: " +
                    "столько звук лежит в буфере перед тем, как его слышно. Блютуз-наушники добавляют своё, его приложение не знает.",
                color = Palette.Muted, fontSize = 12.sp,
            )
            Slider(
                value = shift.toFloat(),
                onValueChange = { app.repo.setVisualizerShift(it.toInt() / 10 * 10) },
                valueRange = VISUALIZER_SHIFT_MIN_MS.toFloat()..VISUALIZER_SHIFT_MAX_MS.toFloat(),
                colors = SliderDefaults.colors(
                    thumbColor = accent, activeTrackColor = accent, inactiveTrackColor = Palette.SurfaceHover,
                    activeTickColor = Color.Transparent, inactiveTickColor = Color.Transparent,
                ),
            )
        }
    }
}
