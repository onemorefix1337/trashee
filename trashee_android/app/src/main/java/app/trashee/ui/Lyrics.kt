package app.trashee.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.api.activeLine
import app.trashee.data.Lyrics
import app.trashee.data.LyricsSource
import app.trashee.data.Track
import kotlinx.coroutines.CancellationException

// A stamp marks the start of a line, so the highlight leads it a little.
private const val LEAD_SECONDS = 0.25
private const val USER_SCROLL_PAUSE_MS = 3500L

private sealed interface LyricsState {
    data object Loading : LyricsState
    data object Failed : LyricsState
    data class Loaded(val lyrics: Lyrics) : LyricsState
}

@Composable
private fun SourceFooter(lyrics: Lyrics, synced: Boolean) {
    val source: LyricsSource = lyrics.source ?: return
    val uri = LocalUriHandler.current
    val accent = LocalAccent.current
    val text = buildAnnotatedString {
        append("Источник: ")
        withStyle(SpanStyle(color = Palette.Text, textDecoration = TextDecoration.Underline)) { append(source.name) }
        append(if (synced) " · с синхронизацией" else " · без синхронизации")
    }
    Text(
        text,
        color = Palette.Muted,
        fontSize = 12.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 28.dp, bottom = 24.dp)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = source.url != null,
            ) { source.url?.let(uri::openUri) },
    )
}

/** Lyrics of the track: synced lines follow the song and can be tapped to seek, plain text just scrolls. */
@Composable
fun LyricsPanel(track: Track, modifier: Modifier = Modifier) {
    val app = LocalApp.current
    var attempt by remember { mutableIntStateOf(0) }
    val state by produceState<LyricsState>(LyricsState.Loading, track.id, attempt) {
        value = LyricsState.Loading
        value = try {
            LyricsState.Loaded(app.repo.lyrics(track))
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            LyricsState.Failed
        }
    }

    Box(modifier.fillMaxSize()) {
        when (val s = state) {
            LyricsState.Loading -> Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                listOf(0.6f, 0.8f, 0.5f, 0.7f, 0.55f).forEach { w ->
                    Box(Modifier.fillMaxWidth(w).height(22.dp).graphicsLayer { alpha = 0.5f }.background(Palette.SurfaceHover, androidx.compose.foundation.shape.RoundedCornerShape(8.dp)))
                }
            }
            LyricsState.Failed -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Не удалось загрузить текст", color = Palette.Muted, fontSize = 14.sp)
                SecondaryButton("Повторить") { attempt += 1 }
            }
            is LyricsState.Loaded -> {
                val lyrics = s.lyrics
                val lines = lyrics.synced
                when {
                    lines != null -> SyncedLyrics(lyrics, app.engine)
                    !lyrics.text.isNullOrBlank() -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 12.dp)) {
                        Text(lyrics.text, color = Palette.Text, fontSize = 20.sp, lineHeight = 30.sp, fontWeight = FontWeight.Medium)
                        SourceFooter(lyrics, synced = false)
                    }
                    else -> Text(
                        if (lyrics.instrumental) "Инструментальный трек, слов нет" else "Для этого трека текста нет",
                        color = Palette.Muted, fontSize = 14.sp, modifier = Modifier.align(Alignment.Center),
                    )
                }
            }
        }
    }
}

@Composable
private fun SyncedLyrics(lyrics: Lyrics, engine: app.trashee.player.PlayerEngine) {
    val lines = lyrics.synced.orEmpty()
    val position by engine.position.collectAsState()
    val active by remember(lines) { derivedStateOf { activeLine(lines, position / 1000.0 + LEAD_SECONDS) } }
    val listState = rememberLazyListState()
    var pausedUntil by remember { mutableLongStateOf(0L) }
    val accent = LocalAccent.current

    LaunchedEffect(active) {
        if (active < 0 || System.currentTimeMillis() < pausedUntil) return@LaunchedEffect
        val viewport = listState.layoutInfo.viewportSize.height
        listState.animateScrollToItem(active, scrollOffset = -(viewport / 2 - 36))
    }

    LazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                // Touching the list means the reader is in charge for a moment.
                awaitEachGesture {
                    awaitFirstDown(pass = PointerEventPass.Initial)
                    pausedUntil = System.currentTimeMillis() + USER_SCROLL_PAUSE_MS
                }
            },
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 120.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        itemsIndexed(lines) { index, line ->
            val distance = if (active < 0) 3 else kotlin.math.abs(index - active)
            val alpha by animateFloatAsState(
                when {
                    active < 0 -> 0.45f
                    distance == 0 -> 1f
                    distance == 1 -> 0.6f
                    distance == 2 -> 0.42f
                    else -> 0.3f
                },
                tween(350), label = "lineAlpha",
            )
            val scale by animateFloatAsState(if (index == active) 1.04f else 1f, tween(350), label = "lineScale")
            Text(
                line.text.ifEmpty { "♪" },
                color = if (index == active) accent else Palette.Text,
                fontSize = 24.sp,
                lineHeight = 32.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .fillMaxWidth()
                    .graphicsLayer {
                        this.alpha = alpha
                        scaleX = scale
                        scaleY = scale
                        transformOrigin = TransformOrigin(0f, 0.5f)
                    }
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                        engine.seekTo((line.time * 1000).toLong())
                    },
            )
        }
        item { SourceFooter(lyrics, synced = true) }
    }
}
