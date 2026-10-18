package app.trashee.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.R
import app.trashee.player.SLEEP_MINUTES
import app.trashee.player.Sleep
import app.trashee.player.formatRemaining

/** The sleep timer button of the player: pick a time or "after this track", and the music fades out and stops. */
@Composable
fun SleepAction() {
    val engine = LocalApp.current.engine
    val sleep by engine.sleep.collectAsState()
    val accent = LocalAccent.current
    var open by remember { mutableStateOf(false) }

    Box {
        IconAction(
            R.drawable.ic_moon, "Таймер сна",
            tint = if (sleep == Sleep.Off) Palette.Muted else accent,
        ) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = Palette.SurfaceHover) {
            when (val state = sleep) {
                is Sleep.Timer -> MenuLabel("Осталось ${formatRemaining(state.remainingMs)}")
                Sleep.AfterTrack -> MenuLabel("До конца трека")
                Sleep.Off -> MenuLabel("Таймер сна")
            }
            SLEEP_MINUTES.forEach { minutes ->
                DropdownMenuItem(
                    text = { Text("Через $minutes мин", color = Palette.Text) },
                    onClick = { engine.startSleep(minutes); open = false },
                )
            }
            DropdownMenuItem(
                text = { Text("После этого трека", color = Palette.Text) },
                onClick = { engine.sleepAfterTrack(); open = false },
            )
            if (sleep != Sleep.Off) {
                DropdownMenuItem(
                    text = { Text("Выключить таймер", color = Palette.Danger) },
                    onClick = { engine.cancelSleep(); open = false },
                )
            }
        }
    }
}

@Composable
private fun MenuLabel(text: String) {
    Text(
        text, color = Palette.Muted, fontSize = 12.sp, fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
    )
}
