package app.trashee.ui

import androidx.annotation.DrawableRes
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.player.coverUrl
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade

/** Shrinks a little while pressed and springs back; the whole app uses it for anything tappable. */
@Composable
fun Modifier.pressable(enabled: Boolean = true, scaleTo: Float = 0.94f, onClick: () -> Unit): Modifier {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        if (pressed) scaleTo else 1f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "press",
    )
    return this
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .clickable(interactionSource = source, indication = null, enabled = enabled, onClick = onClick)
}

@Composable
fun Ic(@DrawableRes id: Int, modifier: Modifier = Modifier, tint: Color = Palette.Text, size: Dp = 24.dp) {
    Icon(painterResource(id), contentDescription = null, tint = tint, modifier = modifier.size(size))
}

@Composable
fun IconAction(
    @DrawableRes id: Int,
    label: String,
    modifier: Modifier = Modifier,
    tint: Color = Palette.Text,
    iconSize: Dp = 24.dp,
    box: Dp = 44.dp,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .size(box)
            .clip(CircleShape)
            .semantics { contentDescription = label; role = Role.Button }
            .pressable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Ic(id, tint = tint, size = iconSize) }
}

@Composable
fun Cover(
    coverUri: String?,
    modifier: Modifier = Modifier,
    size: String = "400x400",
    radius: Dp = 14.dp,
    round: Boolean = false,
) {
    val context = LocalContext.current
    val shape = if (round) CircleShape else RoundedCornerShape(radius)
    Box(modifier.clip(shape).background(Palette.SurfaceHover)) {
        if (coverUri != null) {
            AsyncImage(
                model = ImageRequest.Builder(context).data(coverUrl(coverUri, size)).crossfade(350).build(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier = modifier.padding(horizontal = 20.dp, vertical = 8.dp),
        color = Palette.Text,
        fontSize = 20.sp,
        fontWeight = FontWeight.Bold,
    )
}

/** A row of options with a pill that slides to the selected one. */
@Composable
fun <T> Segmented(options: List<Pair<T, String>>, value: T, onChange: (T) -> Unit, modifier: Modifier = Modifier) {
    val accent = LocalAccent.current
    var width by remember { mutableFloatStateOf(0f) }
    val index = options.indexOfFirst { it.first == value }.coerceAtLeast(0)
    val offset by animateFloatAsState(
        index.toFloat(),
        spring(dampingRatio = 0.75f, stiffness = Spring.StiffnessMedium),
        label = "segment",
    )
    Box(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Palette.SurfaceHover)
            .padding(4.dp)
            .onSizeChanged { width = it.width.toFloat() },
    ) {
        val count = options.size
        Box(
            Modifier
                .height(38.dp)
                .fillMaxWidth(1f / count)
                .graphicsLayer { translationX = offset * (width / count) }
                .clip(RoundedCornerShape(11.dp))
                .background(accent.copy(alpha = 0.22f)),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            options.forEach { (key, label) ->
                Box(
                    Modifier
                        .weight(1f)
                        .height(38.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { onChange(key) },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label,
                        color = if (key == value) Palette.Text else Palette.Muted,
                        fontSize = 14.sp,
                        fontWeight = if (key == value) FontWeight.SemiBold else FontWeight.Medium,
                    )
                }
            }
        }
    }
}

/** Slowly drifting color blobs behind the interface; they wake up while music plays. No blur filters: just gradients. */
@Composable
fun Ambient(playing: Boolean, modifier: Modifier = Modifier) {
    val accent = LocalAccent.current
    val transition = rememberInfiniteTransition(label = "ambient")
    val a by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(26_000, easing = LinearEasing), RepeatMode.Reverse), label = "driftA")
    val b by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(32_000, easing = LinearEasing), RepeatMode.Reverse), label = "driftB")
    val c by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(38_000, easing = LinearEasing), RepeatMode.Reverse), label = "driftC")
    val strength by animateFloatAsState(if (playing) 0.34f else 0.18f, tween(1400), label = "strength")
    Box(
        modifier.fillMaxSize().drawBehind {
            fun blob(cx: Float, cy: Float, radius: Float) = drawCircle(
                brush = Brush.radialGradient(
                    listOf(accent.copy(alpha = strength), Color.Transparent),
                    center = Offset(cx, cy),
                    radius = radius,
                ),
                radius = radius,
                center = Offset(cx, cy),
            )
            blob(size.width * (0.1f + 0.5f * a), size.height * (0.05f + 0.2f * b), size.width * 0.9f)
            blob(size.width * (0.9f - 0.5f * b), size.height * (0.35f + 0.2f * c), size.width * 0.8f)
            blob(size.width * (0.3f + 0.4f * c), size.height * (0.95f - 0.25f * a), size.width * 1.0f)
        },
    )
}

/** Thin seek bar: drag or tap; reports the position only when the finger lifts. */
@Composable
fun SeekBar(positionMs: Long, durationMs: Long, onSeek: (Long) -> Unit, modifier: Modifier = Modifier) {
    val accent = LocalAccent.current
    var dragFraction by remember { mutableStateOf<Float?>(null) }
    val fraction = dragFraction ?: if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
    val thumb by animateFloatAsState(if (dragFraction != null) 1f else 0f, tween(150), label = "thumb")
    Canvas(
        modifier
            .fillMaxWidth()
            .height(28.dp)
            .pointerInput(durationMs) {
                detectTapGestures { offset -> onSeek((offset.x / size.width * durationMs).toLong()) }
            }
            .pointerInput(durationMs) {
                detectDragGestures(
                    onDragStart = { dragFraction = (it.x / size.width).coerceIn(0f, 1f) },
                    onDragEnd = {
                        dragFraction?.let { f -> onSeek((f * durationMs).toLong()) }
                        dragFraction = null
                    },
                    onDragCancel = { dragFraction = null },
                ) { change, _ ->
                    change.consume()
                    dragFraction = (change.position.x / size.width).coerceIn(0f, 1f)
                }
            },
    ) {
        val y = size.height / 2
        val trackHeight = 4.dp.toPx() + 2.dp.toPx() * thumb
        drawRoundRect(Color.White.copy(alpha = 0.12f), Offset(0f, y - trackHeight / 2), androidx.compose.ui.geometry.Size(size.width, trackHeight), androidx.compose.ui.geometry.CornerRadius(trackHeight / 2))
        drawRoundRect(accent, Offset(0f, y - trackHeight / 2), androidx.compose.ui.geometry.Size(size.width * fraction, trackHeight), androidx.compose.ui.geometry.CornerRadius(trackHeight / 2))
        drawCircle(Color.White, radius = 7.dp.toPx() * thumb, center = Offset(size.width * fraction, y))
    }
}

fun formatBytes(bytes: Long): String = when {
    bytes >= 1L shl 30 -> "%.1f ГБ".format(bytes / (1L shl 30).toDouble())
    bytes >= 1L shl 20 -> "${bytes shr 20} МБ"
    bytes > 0 -> "${maxOf(1, bytes shr 10)} КБ"
    else -> "0"
}

fun formatTime(ms: Long): String {
    val total = (ms.coerceAtLeast(0) / 1000).toInt()
    return "%d:%02d".format(total / 60, total % 60)
}

/** "1 трек", "2 трека", "5 треков", "21 трек" */
fun trackWord(count: Int): String {
    val lastTwo = count % 100
    val last = count % 10
    val word = when {
        lastTwo in 11..14 -> "треков"
        last == 1 -> "трек"
        last in 2..4 -> "трека"
        else -> "треков"
    }
    return "$count $word"
}

/** Fades and lifts an item in once, a little later for the ones further down; used on first appearance of lists. */
@Composable
fun Modifier.appear(index: Int): Modifier {
    val progress = remember { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(minOf(index, 10) * 30L)
        progress.animateTo(1f, spring(stiffness = Spring.StiffnessMediumLow))
    }
    return this.graphicsLayer {
        alpha = progress.value
        translationY = (1f - progress.value) * 24.dp.toPx()
    }
}
