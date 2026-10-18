package app.trashee.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.trashee.R
import app.trashee.TrasheeApp
import app.trashee.data.CollectionRef
import app.trashee.data.Toasts
import app.trashee.data.Track
import app.trashee.data.saveTrackFile
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Saves a track as a music file and says where it went. Runs on the app's scope, so leaving the screen does not stop it. */
fun downloadTrackFile(app: TrasheeApp, track: Track) {
    app.scope.launch {
        Toasts.say("Скачиваем «${track.title}»…")
        try {
            val name = saveTrackFile(app, app.caches, track)
            Toasts.say("Сохранено в Музыка/trashee: $name")
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            Toasts.say("Не удалось скачать «${track.title}»")
        }
    }
}

/** The "..." of a track: play next, save as a file, open its album or artist. */
@Composable
fun TrackMenuButton(track: Track) {
    val app = LocalApp.current
    val nav = LocalNav.current
    var open by remember { mutableStateOf(false) }
    Box {
        IconAction(R.drawable.ic_more, "Ещё", tint = Palette.Muted, iconSize = 22.dp, box = 40.dp) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = Palette.SurfaceHover) {
            @Composable fun item(label: String, run: () -> Unit) = DropdownMenuItem(
                text = { Text(label, color = Palette.Text) },
                onClick = { open = false; run() },
            )
            item("Играть дальше") { app.engine.enqueueNext(listOf(track)) }
            item("Добавить в плейлист") { nav.playlistTarget = track }
            item("Скачать файл") { downloadTrackFile(app, track) }
            track.albums.firstOrNull()?.let { album -> item("Альбом: ${album.title}") { nav.push(Route.Collection(CollectionRef.AlbumRef(album.id))) } }
            track.artists.forEach { artist -> item("Исполнитель: ${artist.name}") { nav.push(Route.Collection(CollectionRef.ArtistRef(artist.id))) } }
        }
    }
}
