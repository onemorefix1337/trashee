package app.trashee.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import kotlinx.coroutines.launch
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.R

@Composable
fun PlayPauseIcon(playing: Boolean, size: androidx.compose.ui.unit.Dp, tint: androidx.compose.ui.graphics.Color) {
    AnimatedContent(
        targetState = playing,
        transitionSpec = { (fadeIn(tween(120)) + scaleIn(initialScale = 0.5f)) togetherWith (fadeOut(tween(80)) + scaleOut(targetScale = 0.5f)) },
        label = "playpause",
    ) { isPlaying -> Ic(if (isPlaying) R.drawable.ic_pause else R.drawable.ic_play, tint = tint, size = size) }
}

@Composable
fun MiniPlayer(onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val engine = LocalApp.current.engine
    val ui by engine.ui.collectAsState()
    val track = ui.track ?: return
    val accent = LocalAccent.current

    // Flicking the card sideways skips: it follows the finger, then springs back while the next track starts.
    val scope = rememberCoroutineScope()
    val shift = remember { Animatable(0f) }
    val threshold = with(LocalDensity.current) { 90.dp.toPx() }

    Box(
        modifier
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .fillMaxWidth()
            .graphicsLayer { translationX = shift.value; alpha = 1f - (kotlin.math.abs(shift.value) / (threshold * 4)).coerceIn(0f, 0.4f) }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        val moved = shift.value
                        if (moved < -threshold) engine.next() else if (moved > threshold) engine.previous()
                        scope.launch { shift.animateTo(0f, spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMedium)) }
                    },
                    onDragCancel = { scope.launch { shift.animateTo(0f) } },
                ) { change, amount ->
                    change.consume()
                    scope.launch { shift.snapTo(shift.value + amount) }
                }
            }
            .clip(RoundedCornerShape(22.dp))
            .background(Palette.Surface)
            .border(1.dp, Palette.Line, RoundedCornerShape(22.dp))
            .pressable(scaleTo = 0.98f, onClick = onOpen),
    ) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AnimatedContent(
                targetState = track,
                modifier = Modifier.weight(1f),
                transitionSpec = { (fadeIn(tween(220)) + slideInHorizontally(tween(260)) { it / 6 }) togetherWith (fadeOut(tween(120)) + slideOutHorizontally(tween(160)) { -it / 6 }) },
                contentKey = { it.id },
                label = "mini",
            ) { shown ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Cover(shown.coverUri, Modifier.size(48.dp), size = "100x100", radius = 12.dp)
                    Column {
                        Text(shown.title, color = Palette.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(shown.artistNames, color = Palette.Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            IconAction(R.drawable.ic_prev, "Предыдущий", iconSize = 22.dp, box = 40.dp) { engine.previous() }
            Box(
                Modifier.size(44.dp).clip(androidx.compose.foundation.shape.CircleShape).background(accent).pressable(onClick = { engine.toggle() }),
                contentAlignment = Alignment.Center,
            ) { PlayPauseIcon(ui.playing, 24.dp, androidx.compose.ui.graphics.Color.Black) }
            IconAction(R.drawable.ic_next, "Следующий", iconSize = 22.dp, box = 40.dp) { engine.next() }
        }
        MiniProgress(Modifier.align(Alignment.BottomStart))
    }
}

/** Its own composable so the 4-times-a-second position updates redraw only this line. */
@Composable
private fun MiniProgress(modifier: Modifier) {
    val engine = LocalApp.current.engine
    val position by engine.position.collectAsState()
    val ui by engine.ui.collectAsState()
    val accent = LocalAccent.current
    val fraction = if (ui.durationMs > 0) (position.toFloat() / ui.durationMs).coerceIn(0f, 1f) else 0f
    Box(
        modifier
            .fillMaxWidth()
            .height(2.dp)
            .drawBehind { drawRect(accent, size = Size(size.width * fraction, size.height), topLeft = Offset.Zero) },
    )
}
