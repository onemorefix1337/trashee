package app.trashee.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.TrasheeApp
import app.trashee.api.AddResult
import app.trashee.data.CollectionRef
import app.trashee.data.PlaylistInfo
import app.trashee.data.Toasts
import app.trashee.data.Track
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private const val TITLE_LIMIT = 100

private suspend fun addTo(app: TrasheeApp, kind: Long, title: String, track: Track): Boolean = try {
    val client = app.repo.api ?: error("Нет связи")
    when (client.addToPlaylist(kind, track.id, track.albums.firstOrNull()?.id)) {
        AddResult.Added -> Toasts.say("Добавлено в «$title»")
        AddResult.Exists -> Toasts.say("Трек уже есть в «$title»")
    }
    app.repo.refreshLibrary()
    true
} catch (error: CancellationException) {
    throw error
} catch (_: Exception) {
    Toasts.say("Не удалось добавить в «$title»")
    false
}

/** "Add to playlist": pick one of your playlists or make a new one with the track already in it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistPickerSheet(track: Track, onDismiss: () -> Unit) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val playlists by app.repo.playlists.collectAsState()
    val accent = LocalAccent.current
    var title by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val own = playlists.orEmpty().filter { it.mine && (it.ref as? CollectionRef.Playlist)?.kind != null }

    LaunchedEffect(Unit) { if (playlists == null) app.repo.refreshLibrary() }

    fun create() {
        val name = title.trim()
        if (name.isEmpty() || busy) return
        busy = true
        scope.launch {
            try {
                val client = app.repo.api ?: error("Нет связи")
                val info = client.createPlaylist(name)
                val kind = (info.ref as? CollectionRef.Playlist)?.kind
                if (kind != null) client.addToPlaylist(kind, track.id, track.albums.firstOrNull()?.id)
                Toasts.say("Плейлист «${info.title}» создан, трек добавлен")
                app.repo.refreshLibrary()
                onDismiss()
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                Toasts.say("Не удалось создать плейлист")
                busy = false
            }
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Palette.Surface) {
        Column(Modifier.navigationBarsPadding().padding(horizontal = 20.dp).padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column {
                Text("Добавить в плейлист", color = Palette.Text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text("${track.title} — ${track.artistNames}", color = Palette.Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier.weight(1f).clip(RoundedCornerShape(24.dp)).background(Palette.SurfaceHover).padding(horizontal = 16.dp, vertical = 12.dp),
                ) {
                    if (title.isEmpty()) Text("Новый плейлист", color = Palette.Muted, fontSize = 15.sp)
                    BasicTextField(
                        value = title,
                        onValueChange = { if (it.length <= TITLE_LIMIT) title = it },
                        singleLine = true,
                        enabled = !busy,
                        textStyle = TextStyle(color = Palette.Text, fontSize = 15.sp),
                        cursorBrush = SolidColor(accent),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { create() }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Text(
                    "Создать", color = Color.Black, fontSize = 14.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .clip(RoundedCornerShape(24.dp))
                        .background(if (title.isBlank() || busy) accent.copy(alpha = 0.4f) else accent)
                        .clickable(enabled = title.isNotBlank() && !busy) { create() }
                        .padding(horizontal = 18.dp, vertical = 12.dp),
                )
            }
            when {
                playlists == null -> Text("Загружаем плейлисты…", color = Palette.Muted, fontSize = 14.sp)
                own.isEmpty() -> Text("Своих плейлистов пока нет, создай первый выше.", color = Palette.Muted, fontSize = 14.sp)
                else -> LazyColumn(Modifier.heightIn(max = 320.dp)) {
                    items(own, key = { it.key }) { info -> PlaylistChoice(info, enabled = !busy) {
                        val kind = (info.ref as CollectionRef.Playlist).kind ?: return@PlaylistChoice
                        busy = true
                        scope.launch {
                            if (addTo(app, kind, info.title, track)) onDismiss() else busy = false
                        }
                    } }
                }
            }
        }
    }
}

@Composable
private fun PlaylistChoice(info: PlaylistInfo, enabled: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(enabled = enabled, onClick = onClick).padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Cover(info.coverUri, Modifier.size(48.dp), size = "100x100", radius = 10.dp)
        Column {
            Text(info.title, color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(trackWord(info.trackCount), color = Palette.Muted, fontSize = 12.sp)
        }
    }
}
