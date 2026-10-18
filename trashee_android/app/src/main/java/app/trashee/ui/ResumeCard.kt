package app.trashee.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
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

/** The app always remembers the track and the second it was closed at; this is only about playing it without a tap. */
@Composable
fun ResumeCard() {
    val app = LocalApp.current
    val on by app.repo.resumeWithHeadphones.collectAsState()
    val accent = LocalAccent.current

    Card("Запуск") {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Сразу играть в наушниках", color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Text(
                    "Приложение помнит трек и секунду, где его закрыли. Если при открытии подключены наушники, музыка продолжается сама. Без них достаточно нажать на плеер.",
                    color = Palette.Muted, fontSize = 12.sp,
                )
            }
            Switch(
                checked = on,
                onCheckedChange = { app.repo.setResumeWithHeadphones(it) },
                colors = SwitchDefaults.colors(checkedTrackColor = accent, checkedThumbColor = Color.Black),
            )
        }
    }
}
