package app.trashee.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.sync.Found
import app.trashee.sync.LinkState
import app.trashee.sync.PairingError
import app.trashee.sync.discoverComputers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
private fun fieldColors() = TextFieldDefaults.colors(
    focusedContainerColor = Palette.SurfaceHover,
    unfocusedContainerColor = Palette.SurfaceHover,
    focusedTextColor = Palette.Text,
    unfocusedTextColor = Palette.Text,
    focusedIndicatorColor = Color.Transparent,
    unfocusedIndicatorColor = Color.Transparent,
    cursorColor = LocalAccent.current,
)

/** The dialog that pairs the phone with a computer: its address (or pick one found) and the code it shows. */
@Composable
private fun PairDialog(initial: Found?, found: List<Found>, onDone: () -> Unit) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var address by remember { mutableStateOf(initial?.address.orEmpty()) }
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val accent = LocalAccent.current

    AlertDialog(
        onDismissRequest = { if (!busy) onDone() },
        containerColor = Palette.Surface,
        title = { Text("Подключить компьютер", color = Palette.Text) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "На компьютере: Настройки → Синхронизация → «Показать код». Оба устройства в одной Wi-Fi сети.",
                    color = Palette.Muted, fontSize = 13.sp,
                )
                if (found.isNotEmpty()) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        found.forEach { computer ->
                            Text(
                                computer.name, color = if (computer.address == address) Color.Black else Palette.Text, fontSize = 13.sp,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .background(if (computer.address == address) accent else Palette.SurfaceHover)
                                    .clickable { address = computer.address }
                                    .padding(horizontal = 14.dp, vertical = 8.dp),
                            )
                        }
                    }
                }
                TextField(
                    value = address, onValueChange = { address = it }, singleLine = true, enabled = !busy,
                    label = { Text("Адрес, например 192.168.0.5:47874", color = Palette.Muted) },
                    colors = fieldColors(), shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(),
                )
                TextField(
                    value = code, onValueChange = { code = it.filter(Char::isDigit).take(6) }, singleLine = true, enabled = !busy,
                    label = { Text("Код с компьютера", color = Palette.Muted) },
                    colors = fieldColors(), shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, color = Palette.Danger, fontSize = 13.sp) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !busy && address.isNotBlank() && code.length == 6,
                onClick = {
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            app.sync.pair(address, code)
                            onDone()
                        } catch (failure: CancellationException) {
                            throw failure
                        } catch (failure: PairingError) {
                            error = failure.message
                            busy = false
                        } catch (_: Exception) {
                            error = "Не удалось подключиться."
                            busy = false
                        }
                    }
                },
            ) { Text(if (busy) "Подключаем…" else "Подключить", color = accent) }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDone) { Text("Отмена", color = Palette.Muted) } },
    )
}

/** Pairing with a computer, and what its connection is doing. */
@Composable
fun SyncCard() {
    val app = LocalApp.current
    val paired by app.sync.paired.collectAsState()
    val state by app.sync.state.collectAsState()
    val scope = rememberCoroutineScope()
    var finding by remember { mutableStateOf(false) }
    var found by remember { mutableStateOf<List<Found>>(emptyList()) }
    var dialog by remember { mutableStateOf(false) }

    LaunchedEffect(finding) {
        if (finding) {
            found = discoverComputers(app)
            finding = false
            dialog = true
        }
    }
    if (dialog) PairDialog(initial = found.firstOrNull(), found = found, onDone = { dialog = false })

    Card("Синхронизация") {
        val computer = paired
        if (computer == null) {
            Text(
                "Передавай музыку между телефоном и компьютером в одной Wi-Fi сети и управляй одним с другого. Токен Яндекса между устройствами не передаётся.",
                color = Palette.Muted, fontSize = 13.sp,
            )
            SecondaryButton(if (finding) "Ищем компьютер…" else "Подключить компьютер") { if (!finding) finding = true }
        } else {
            Column(Modifier.fillMaxWidth()) {
                Text(computer.serverName, color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Text(
                    when (state) {
                        is LinkState.Online -> "В сети · ${computer.address}"
                        LinkState.Connecting -> "Подключаемся…"
                        is LinkState.Retrying -> "Не в сети. Пробуем снова…"
                        LinkState.Forgotten -> "Компьютер забыл этот телефон"
                        LinkState.Off -> "Отключено"
                    },
                    color = Palette.Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp),
                )
            }
            Text(
                "Кнопка с двумя экранами в плеере передаёт музыку на компьютер и забирает её обратно.",
                color = Palette.Muted, fontSize = 12.sp,
            )
            SecondaryButton("Отключить") { scope.launch { app.sync.unpair() } }
        }
    }
}
