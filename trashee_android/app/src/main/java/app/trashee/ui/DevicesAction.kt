package app.trashee.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.R
import app.trashee.sync.LinkState
import app.trashee.sync.SyncCommand
import kotlinx.coroutines.launch

/** The player's button for the computer paired with this phone: take over what it plays, hand over what plays here. */
@Composable
fun DevicesAction() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val paired by app.sync.paired.collectAsState()
    val state by app.sync.state.collectAsState()
    val host by app.sync.host.collectAsState()
    val accent = LocalAccent.current
    var open by remember { mutableStateOf(false) }
    val online = state is LinkState.Online

    Box {
        IconAction(R.drawable.ic_devices, "Устройства", tint = if (paired != null && online) accent else Palette.Muted) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = Palette.SurfaceHover) {
            val computer = paired
            if (computer == null) {
                DropdownMenuItem(
                    text = { Text("Подключить компьютер", color = Palette.Text) },
                    onClick = { open = false; nav.tab(Route.Settings) },
                )
            } else {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                    Text(computer.serverName, color = Palette.Text, fontSize = 14.sp)
                    Text(
                        if (!online) "Не в сети" else host?.track?.let { "${it.title} · ${if (host?.playing == true) "играет" else "на паузе"}" } ?: "Ничего не играет",
                        color = Palette.Muted, fontSize = 12.sp,
                    )
                }
                if (online) {
                    DropdownMenuItem(
                        text = { Text("Играть на компьютере", color = Palette.Text) },
                        onClick = { open = false; scope.launch { app.sync.handOver() } },
                    )
                    if (host?.track != null) {
                        DropdownMenuItem(
                            text = { Text("Забрать с компьютера", color = Palette.Text) },
                            onClick = { open = false; scope.launch { app.sync.pull() } },
                        )
                        DropdownMenuItem(
                            text = { Text(if (host?.playing == true) "Пауза на компьютере" else "Играть на компьютере (там)", color = Palette.Text) },
                            onClick = { scope.launch { app.sync.control(SyncCommand("toggle")) } },
                        )
                        DropdownMenuItem(
                            text = { Text("Следующий на компьютере", color = Palette.Text) },
                            onClick = { scope.launch { app.sync.control(SyncCommand("next")) } },
                        )
                    }
                }
            }
        }
    }
}
