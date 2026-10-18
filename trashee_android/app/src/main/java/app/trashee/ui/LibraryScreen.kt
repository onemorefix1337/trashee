package app.trashee.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.data.CollectionRef

@Composable
fun PlaylistCard(coverUri: String?, title: String, subtitle: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(modifier.pressable(scaleTo = 0.96f, onClick = onClick)) {
        Cover(coverUri, Modifier.fillMaxWidth().aspectRatio(1f), size = "400x400", radius = 18.dp)
        Text(title, color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
        Text(subtitle, color = Palette.Muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}


@Composable
fun LibraryScreen(padding: PaddingValues) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val ui by app.engine.ui.collectAsState()
    val liked by app.repo.liked.collectAsState()
    val playlists by app.repo.playlists.collectAsState()
    val failed by app.repo.libraryFailed.collectAsState()
    var tab by rememberSaveable { mutableStateOf("liked") }
    val bottom = padding.calculateBottomPadding() + 16.dp

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Text("Коллекция", color = Palette.Text, fontSize = 34.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
        Segmented(
            options = listOf("liked" to "Любимое", "playlists" to "Плейлисты"),
            value = tab, onChange = { tab = it },
            modifier = Modifier.padding(horizontal = 20.dp).fillMaxWidth(),
        )
        Box(Modifier.fillMaxSize()) {
            if (tab == "liked") {
                val tracks = liked
                when {
                    tracks == null && failed -> Retry { app.repo.refreshLibrary() }
                    tracks == null -> CircularProgressIndicator(color = LocalAccent.current, modifier = Modifier.align(Alignment.TopCenter).padding(top = 48.dp))
                    tracks.isEmpty() -> Text("Здесь будут треки, которые тебе нравятся", color = Palette.Muted, fontSize = 14.sp, modifier = Modifier.align(Alignment.TopCenter).padding(top = 48.dp))
                    else -> LazyColumn(contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 12.dp, bottom = bottom)) {
                        item {
                            PlayAllRow(
                                onPlay = { app.engine.playTracks(tracks, 0) },
                                onShuffle = { app.engine.playTracks(tracks.shuffled(), 0) },
                                extra = { SaveOfflineButton(null, "Мне нравится") },
                            )
                        }
                        itemsIndexed(tracks, key = { i, t -> "${t.id}#$i" }) { index, track ->
                            TrackRow(
                                track, index, active = ui.track?.id == track.id, playing = ui.playing,
                                onClick = { app.engine.playTracks(tracks, index) },
                                trailing = { LikeButton(track, iconSize = 22.dp, box = 40.dp) },
                            )
                        }
                    }
                }
            } else {
                val list = playlists
                when {
                    list == null -> CircularProgressIndicator(color = LocalAccent.current, modifier = Modifier.align(Alignment.TopCenter).padding(top = 48.dp))
                    list.isEmpty() -> Text("Плейлистов пока нет", color = Palette.Muted, fontSize = 14.sp, modifier = Modifier.align(Alignment.TopCenter).padding(top = 48.dp))
                    else -> LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = bottom),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalArrangement = Arrangement.spacedBy(18.dp),
                    ) {
                        itemsIndexed(list, key = { _, p -> p.key }) { index, playlist ->
                            PlaylistCard(
                                playlist.coverUri, playlist.title,
                                "${trackWord(playlist.trackCount)}${if (playlist.mine || playlist.owner.isEmpty()) "" else " · ${playlist.owner}"}",
                                modifier = Modifier.appear(index),
                            ) { nav.push(Route.Collection(playlist.ref as CollectionRef)) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun PlayAllRow(onPlay: () -> Unit, onShuffle: () -> Unit, extra: @Composable (() -> Unit)? = null) {
    androidx.compose.foundation.layout.FlowRow(
        Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SecondaryButton("Слушать", onClick = onPlay)
        SecondaryButton("Вперемешку", onClick = onShuffle)
        extra?.invoke()
    }
}

@Composable
fun Retry(onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 48.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Не удалось загрузить", color = Palette.Muted, fontSize = 14.sp)
        SecondaryButton("Повторить", onClick = onRetry)
    }
}
