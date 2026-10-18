package app.trashee.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.R
import app.trashee.data.Collection
import app.trashee.data.CollectionRef
import app.trashee.data.Toasts
import app.trashee.data.Track
import app.trashee.data.key
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private const val TOP_TRACKS = 10

private sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data object Failed : Load<Nothing>
    data class Ready<T>(val value: T) : Load<T>
}

@Composable
fun BackBar(title: String? = null, onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconAction(R.drawable.ic_chevron_left, "Назад", onClick = onBack)
        if (title != null) Text(title, color = Palette.Text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun CollectionScreen(ref: CollectionRef, padding: PaddingValues) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val ui by app.engine.ui.collectAsState()
    val pins by app.repo.pins.collectAsState()
    val scope = rememberCoroutineScope()
    var attempt by remember { mutableIntStateOf(0) }
    var load by remember(ref, attempt) { mutableStateOf<Load<Collection>>(Load.Loading) }
    var showAll by remember(ref) { mutableStateOf(false) }

    LaunchedEffect(ref, attempt) {
        load = try {
            Load.Ready(app.repo.collection(ref))
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            Load.Failed
        }
    }

    Column(Modifier.fillMaxSize()) {
        BackBar(onBack = { nav.back() })
        when (val state = load) {
            Load.Loading -> Box(Modifier.fillMaxSize()) {
                CircularProgressIndicator(color = LocalAccent.current, modifier = Modifier.align(Alignment.TopCenter).padding(top = 48.dp))
            }
            Load.Failed -> Retry { attempt += 1 }
            is Load.Ready -> {
                val data = state.value
                val isArtist = ref is CollectionRef.ArtistRef
                val tracks = if (isArtist && !showAll) data.tracks.take(TOP_TRACKS) else data.tracks
                val pinned = pins.orEmpty().any { it.key == ref.key() }
                LazyColumn(contentPadding = PaddingValues(start = 8.dp, end = 8.dp, bottom = padding.calculateBottomPadding() + 16.dp)) {
                    item {
                        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Cover(data.coverUri, Modifier.size(220.dp), size = "400x400", radius = 24.dp, round = isArtist)
                            Spacer(Modifier.height(16.dp))
                            Text(data.title, color = Palette.Text, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                            Text(
                                listOf(data.subtitle, if (isArtist) null else trackWord(data.trackCount)).filterNotNull().filter { it.isNotEmpty() }.joinToString(" · "),
                                color = Palette.Muted, fontSize = 14.sp, textAlign = TextAlign.Center,
                            )
                            Spacer(Modifier.height(14.dp))
                            androidx.compose.foundation.layout.FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                SecondaryButton("Слушать") { app.engine.playTracks(data.tracks, 0) }
                                SecondaryButton("Вперемешку") { app.engine.playTracks(data.tracks.shuffled(), 0) }
                                SaveOfflineButton(ref, data.title)
                                SecondaryButton(if (pinned) "Закреплено" else "Закрепить") {
                                    scope.launch {
                                        val done = runCatching { (app.repo.api ?: error("Нет связи")).setPin(ref, !pinned) }
                                        if (done.isFailure) Toasts.say("Не удалось изменить закрепление")
                                        app.repo.refreshLibrary()
                                    }
                                }
                            }
                        }
                    }
                    if (isArtist && data.tracks.isNotEmpty()) item { SectionTitle("Популярное", Modifier.padding(top = 8.dp)) }
                    itemsIndexed(tracks, key = { i, t -> "${t.id}#$i" }) { index, track ->
                        TrackRow(
                            track, index, active = ui.track?.id == track.id, playing = ui.playing,
                            onClick = { app.engine.playTracks(data.tracks, data.tracks.indexOf(track)) },
                            trailing = { LikeButton(track, iconSize = 22.dp, box = 40.dp) },
                        )
                    }
                    if (isArtist && !showAll && data.tracks.size > TOP_TRACKS) {
                        item {
                            Box(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                                SecondaryButton("Показать все (${data.tracks.size})") { showAll = true }
                            }
                        }
                    }
                    if (data.albums.isNotEmpty()) {
                        item { Spacer(Modifier.height(12.dp)); SectionTitle("Альбомы и релизы") }
                        item {
                            LazyRow(contentPadding = PaddingValues(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                itemsIndexed(data.albums, key = { _, a -> a.id }) { index, album ->
                                    CoverCard(
                                        album.coverUri, album.title,
                                        listOfNotNull(album.year?.toString(), album.kind).joinToString(" · "),
                                        round = false, modifier = Modifier.appear(index),
                                    ) { nav.push(Route.Collection(CollectionRef.AlbumRef(album.id))) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SimilarScreen(seed: Track, padding: PaddingValues) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val ui by app.engine.ui.collectAsState()
    var attempt by remember { mutableIntStateOf(0) }
    var load by remember(seed.id, attempt) { mutableStateOf<Load<List<Track>>>(Load.Loading) }
    LaunchedEffect(seed.id, attempt) {
        load = try {
            Load.Ready(app.repo.api!!.similar(seed.id))
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            Load.Failed
        }
    }
    Column(Modifier.fillMaxSize()) {
        BackBar("Похожие на «${seed.title}»") { nav.back() }
        when (val state = load) {
            Load.Loading -> Box(Modifier.fillMaxSize()) {
                CircularProgressIndicator(color = LocalAccent.current, modifier = Modifier.align(Alignment.TopCenter).padding(top = 48.dp))
            }
            Load.Failed -> Retry { attempt += 1 }
            is Load.Ready -> {
                val tracks = state.value.filter { it.available }
                if (tracks.isEmpty()) {
                    Text("Похожих треков нет", color = Palette.Muted, fontSize = 14.sp, modifier = Modifier.padding(24.dp))
                } else {
                    LazyColumn(contentPadding = PaddingValues(8.dp, 8.dp, 8.dp, padding.calculateBottomPadding() + 16.dp)) {
                        item { PlayAllRow({ app.engine.playTracks(tracks, 0) }, { app.engine.playTracks(tracks.shuffled(), 0) }) }
                        itemsIndexed(tracks, key = { i, t -> "${t.id}#$i" }) { index, track ->
                            TrackRow(
                                track, index, active = ui.track?.id == track.id, playing = ui.playing,
                                onClick = { app.engine.playTracks(tracks, index) },
                                trailing = { LikeButton(track, iconSize = 22.dp, box = 40.dp) },
                            )
                        }
                    }
                }
            }
        }
    }
}
