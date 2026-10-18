package app.trashee.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.launch
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.Player
import app.trashee.R
import app.trashee.data.CollectionRef

private enum class PlayerMode { Cover, Lyrics, Queue }

@Composable
private fun TimeRow(durationMs: Long) {
    val engine = LocalApp.current.engine
    val position by engine.position.collectAsState()
    Column {
        SeekBar(position, durationMs, onSeek = { engine.seekTo(it) })
        Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(formatTime(position), color = Palette.Muted, fontSize = 12.sp)
            Text(formatTime(durationMs), color = Palette.Muted, fontSize = 12.sp)
        }
    }
}

@Composable
private fun QueuePanel() {
    val engine = LocalApp.current.engine
    val ui by engine.ui.collectAsState()
    val listState = rememberLazyListState()
    LaunchedEffect(Unit) { if (ui.index > 0) listState.scrollToItem((ui.index - 1).coerceAtLeast(0)) }
    LazyColumn(state = listState, contentPadding = PaddingValues(vertical = 4.dp), modifier = Modifier.fillMaxSize()) {
        itemsIndexed(ui.queue, key = { i, t -> "${t.id}#$i" }) { index, track ->
            TrackRow(
                track, index = 0, active = index == ui.index, playing = ui.playing,
                onClick = { engine.jumpTo(index) },
            )
        }
    }
}

@Composable
fun PlayerScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val engine = app.engine
    val ui by engine.ui.collectAsState()
    val accent = LocalAccent.current
    var mode by rememberSaveable { mutableStateOf(PlayerMode.Cover) }
    val track = ui.track

    LaunchedEffect(track == null) { if (track == null) nav.playerOpen = false }
    if (track == null) return

    // Pulling the player down closes it: it follows the finger, and either leaves or springs back.
    val scope = rememberCoroutineScope()
    val drag = remember { Animatable(0f) }
    val dismissDrag = Modifier.pointerInput(Unit) {
        detectVerticalDragGestures(
            onDragEnd = {
                if (drag.value > size.height * 0.18f) nav.playerOpen = false
                else scope.launch { drag.animateTo(0f, spring(dampingRatio = 0.8f, stiffness = Spring.StiffnessMedium)) }
            },
            onDragCancel = { scope.launch { drag.animateTo(0f) } },
        ) { change, amount ->
            change.consume()
            scope.launch { drag.snapTo((drag.value + amount).coerceAtLeast(0f)) }
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .graphicsLayer {
                translationY = drag.value
                alpha = 1f - (drag.value / size.height).coerceIn(0f, 0.5f)
            }
            .background(Palette.Bg),
    ) {
        Ambient(ui.playing)
        SpectrumBars(
            read = { engine.spectrum.bandsNow() },
            playing = ui.playing,
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(280.dp),
        )
        Column(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(Modifier.fillMaxWidth().height(52.dp).then(dismissDrag), verticalAlignment = Alignment.CenterVertically) {
                IconAction(R.drawable.ic_chevron_down, "Свернуть") { nav.playerOpen = false }
                Text(
                    if (ui.wave) "Моя волна" else "Сейчас играет",
                    color = Palette.Muted, fontSize = 13.sp, fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.size(44.dp))
            }

            Box(
                Modifier.weight(1f).fillMaxWidth().then(if (mode == PlayerMode.Cover) dismissDrag else Modifier),
                contentAlignment = Alignment.Center,
            ) {
                AnimatedContent(
                    targetState = mode,
                    transitionSpec = { fadeIn(tween(250)) togetherWith fadeOut(tween(150)) },
                    label = "panel",
                ) { m ->
                    when (m) {
                        PlayerMode.Cover -> BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            val side = minOf(maxWidth, maxHeight)
                            // The cover breathes with play and pause, and glows in the color of itself.
                            val scale by animateFloatAsState(
                                if (ui.playing) 1f else 0.9f,
                                spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow),
                                label = "coverScale",
                            )
                            Box(
                                Modifier
                                    .size(side)
                                    .graphicsLayer { scaleX = scale; scaleY = scale }
                                    .drawBehind {
                                        drawCircle(
                                            Brush.radialGradient(listOf(accent.copy(alpha = 0.35f), Color.Transparent), center = center, radius = this.size.width * 0.8f),
                                            radius = this.size.width * 0.8f,
                                        )
                                    },
                            ) {
                                // A new track's cover grows in over the old one as it fades away.
                                AnimatedContent(
                                    targetState = track.coverUri,
                                    transitionSpec = { (fadeIn(tween(450)) + scaleIn(initialScale = 0.9f, animationSpec = spring(stiffness = Spring.StiffnessLow))) togetherWith fadeOut(tween(350)) },
                                    label = "cover",
                                ) { uri -> Cover(uri, Modifier.fillMaxSize(), size = "600x600", radius = 28.dp) }
                            }
                        }
                        PlayerMode.Lyrics -> LyricsPanel(track)
                        PlayerMode.Queue -> QueuePanel()
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                AnimatedContent(
                    targetState = track,
                    modifier = Modifier.weight(1f),
                    transitionSpec = { (fadeIn(tween(250)) + slideInVertically(tween(300)) { it / 3 }) togetherWith (fadeOut(tween(150)) + slideOutVertically(tween(200)) { -it / 3 }) },
                    contentKey = { it.id },
                    label = "title",
                ) { shown ->
                    Column {
                        Text(
                            buildString {
                                append(shown.title)
                                shown.version?.let { append(" · $it") }
                            },
                            color = Palette.Text, fontSize = 24.sp, fontWeight = FontWeight.Bold,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            shown.artistNames, color = Palette.Muted, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.clickable(
                                interactionSource = remember { MutableInteractionSource() }, indication = null,
                                enabled = shown.artists.isNotEmpty(),
                            ) { nav.push(Route.Collection(CollectionRef.ArtistRef(shown.artists.first().id))) },
                        )
                    }
                }
                LikeButton(track, iconSize = 28.dp, box = 48.dp)
            }

            ui.error?.let { Text(it, color = Palette.Danger, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp)) }
            Spacer(Modifier.height(8.dp))
            TimeRow(if (ui.durationMs > 0) ui.durationMs else track.durationMs)
            Spacer(Modifier.height(4.dp))

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                IconAction(
                    R.drawable.ic_shuffle, "Вперемешку", box = 48.dp,
                    tint = if (ui.shuffle) accent else if (ui.wave) Palette.Line else Palette.Muted,
                ) { engine.toggleShuffle() }
                IconAction(R.drawable.ic_prev, "Предыдущий", iconSize = 32.dp, box = 56.dp) { engine.previous() }
                Box(
                    Modifier.size(76.dp).clip(CircleShape).background(accent).pressable(scaleTo = 0.9f) { engine.toggle() },
                    contentAlignment = Alignment.Center,
                ) { PlayPauseIcon(ui.playing, 36.dp, Color.Black) }
                IconAction(R.drawable.ic_next, "Следующий", iconSize = 32.dp, box = 56.dp) { engine.next() }
                IconAction(
                    if (ui.repeat == Player.REPEAT_MODE_ONE) R.drawable.ic_repeat_one else R.drawable.ic_repeat,
                    "Повтор", box = 48.dp,
                    tint = if (ui.repeat != Player.REPEAT_MODE_OFF) accent else Palette.Muted,
                ) { engine.cycleRepeat() }
            }

            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                IconAction(R.drawable.ic_thumb_down, "Не нравится", tint = Palette.Muted) { engine.dislikeCurrent() }
                IconAction(R.drawable.ic_similar, "Похожие", tint = Palette.Muted) { nav.push(Route.Similar(track)) }
                IconAction(
                    R.drawable.ic_lyrics, "Текст",
                    tint = if (mode == PlayerMode.Lyrics) accent else Palette.Muted,
                ) { mode = if (mode == PlayerMode.Lyrics) PlayerMode.Cover else PlayerMode.Lyrics }
                IconAction(
                    R.drawable.ic_queue, "Очередь",
                    tint = if (mode == PlayerMode.Queue) accent else Palette.Muted,
                ) { mode = if (mode == PlayerMode.Queue) PlayerMode.Cover else PlayerMode.Queue }
                SleepAction()
                DevicesAction()
                IconAction(R.drawable.ic_download, "Скачать файл", tint = Palette.Muted) { downloadTrackFile(app, track) }
            }
        }
    }
}
