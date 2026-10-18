package app.trashee.ui

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.BuildConfig
import app.trashee.data.Quality
import app.trashee.data.Session
import app.trashee.update.UpdateState
import app.trashee.update.UpdateStatus

@Composable
private fun Card(title: String, content: @Composable () -> Unit) {
    Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
        Text(title, color = Palette.Text, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp))
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Palette.Surface).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) { content() }
    }
}

@Composable
private fun InfoRow(label: String, value: String, hint: String? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            hint?.let { Text(it, color = Palette.Muted, fontSize = 12.sp) }
        }
        Text(value, color = Palette.Muted, fontSize = 14.sp)
    }
}

@Composable
private fun CacheCard() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val prefetch by app.repo.prefetchNext.collectAsState()
    val saved by app.offline.saved.collectAsState()
    val progress by app.offline.progress.collectAsState()
    val accent = LocalAccent.current
    var streamBytes by remember { mutableLongStateOf(0L) }
    var offlineBytes by remember { mutableLongStateOf(0L) }
    var reload by remember { mutableLongStateOf(0L) }

    // Sizes change when a collection starts or finishes saving, not on every track.
    LaunchedEffect(saved, progress.isEmpty(), reload) {
        streamBytes = app.caches.streamBytes()
        offlineBytes = app.caches.offlineBytes()
    }

    Card("Кеш и загрузки") {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Подгружать следующий трек", color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Text("Со второй половины трека следующий скачивается заранее, и переход к нему без ожидания.", color = Palette.Muted, fontSize = 12.sp)
            }
            Switch(
                checked = prefetch,
                onCheckedChange = { app.repo.setPrefetchNext(it) },
                colors = SwitchDefaults.colors(checkedTrackColor = accent, checkedThumbColor = Color.Black),
            )
        }
        InfoRow("Кеш прослушанного", formatBytes(streamBytes), "Самые старые удаляются сами, когда набирается 400 МБ.")
        if (streamBytes > 0) SecondaryButton("Очистить кеш") { app.caches.clearStream(); reload += 1 }
        InfoRow(
            "Сохранено офлайн",
            "${if (saved.isNotEmpty()) "${saved.size} · " else ""}${formatBytes(offlineBytes)}",
            "Плейлисты и альбомы целиком: треки, тексты и обложки. Сохраняются кнопкой на странице плейлиста.",
        )
        saved.forEach { entry ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(entry.title, color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                    Text(listOf(trackWord(entry.trackCount), entry.subtitle).filter { it.isNotEmpty() }.joinToString(" · "), color = Palette.Muted, fontSize = 12.sp)
                }
                SecondaryButton("Убрать") { scope.launch { app.offline.remove(entry.key) } }
            }
        }
        if (saved.isNotEmpty()) SecondaryButton("Удалить всё сохранённое") { scope.launch { app.offline.removeAll() } }
    }
}

private fun updateHint(state: UpdateState): String = when (state.status) {
    UpdateStatus.Checking -> "Проверяем…"
    UpdateStatus.Available -> "Доступна версия ${state.info?.version}${state.info?.apk?.size?.takeIf { it > 0 }?.let { ", ${formatBytes(it)}" }.orEmpty()}."
    UpdateStatus.Downloading -> "Скачиваем версию ${state.info?.version}: ${if (state.total > 0) state.received * 100 / state.total else 0}%"
    UpdateStatus.NeedPermission -> "Нужно разрешить установку приложений."
    UpdateStatus.Installing -> "Подтверди установку в окне Android."
    UpdateStatus.Error -> state.error ?: "Не удалось проверить."
    UpdateStatus.None -> "Установлена последняя версия."
    UpdateStatus.Idle -> "Ещё не проверяли с этого запуска."
}

@Composable
private fun UpdatesCard() {
    val app = LocalApp.current
    val state by app.updater.state.collectAsState()
    val accent = LocalAccent.current
    val busy = state.status == UpdateStatus.Checking || state.status == UpdateStatus.Downloading
    val hasUpdate = state.info != null && state.status in setOf(
        UpdateStatus.Available, UpdateStatus.Downloading,
        UpdateStatus.NeedPermission, UpdateStatus.Installing,
    )
    Card("Обновления") {
        InfoRow("Версия ${BuildConfig.VERSION_NAME}", "", updateHint(state))
        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (hasUpdate) SecondaryButton("Обновить до ${state.info?.version}") { app.updater.show() }
            SecondaryButton(if (state.status == UpdateStatus.Checking) "Проверяем…" else "Проверить обновления") {
                if (!busy) app.updater.check(manual = true)
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Проверять при запуске", color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Text("Если вышла новая версия, trashee спросит, обновляться ли.", color = Palette.Muted, fontSize = 12.sp)
            }
            Switch(
                checked = state.auto,
                onCheckedChange = { app.updater.setAuto(it) },
                colors = SwitchDefaults.colors(checkedTrackColor = accent, checkedThumbColor = Color.Black),
            )
        }
    }
}

@Composable
fun SettingsScreen(padding: PaddingValues) {
    val app = LocalApp.current
    val quality by app.repo.quality.collectAsState()
    val session by app.repo.session.collectAsState()
    val account = (session as? Session.Ready)?.account

    LazyColumn(Modifier.statusBarsPadding(), contentPadding = PaddingValues(bottom = padding.calculateBottomPadding() + 16.dp)) {
        item { Text("Настройки", color = Palette.Text, fontSize = 34.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) }
        item {
            Card("Звук") {
                Text("Качество", color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Segmented(
                    options = Quality.entries.map { it to it.label },
                    value = quality, onChange = { app.repo.setQuality(it) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    if (account?.hasPlus == true) "Меняется со следующего трека." else "Без Яндекс Плюса «Без потерь» может не сработать, тогда Яндекс отдаст лучшее из доступного.",
                    color = Palette.Muted, fontSize = 12.sp,
                )
            }
        }
        item { CacheCard() }
        item {
            Card("Аккаунт") {
                InfoRow(account?.login ?: "—", if (account?.hasPlus == true) "Яндекс Плюс" else "Без подписки")
                SecondaryButton("Выйти") { app.engine.stop(); app.repo.logout() }
            }
        }
        item { UpdatesCard() }
        item {
            Card("О приложении") {
                InfoRow("Версия", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                InfoRow("Сборка", if (BuildConfig.DEBUG) "отладочная" else "выпускная")
                InfoRow("Система", "Android ${Build.VERSION.RELEASE} · API ${Build.VERSION.SDK_INT}")
                InfoRow("Устройство", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
            }
        }
        item {
            Spacer(Modifier.height(8.dp))
            Text(
                "trashee — неофициальный клиент Яндекс Музыки. Он использует закрытое API сервиса, которое Яндекс может изменить.",
                color = Palette.Muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp),
            )
        }
    }
}
