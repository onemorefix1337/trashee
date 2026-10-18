package app.trashee.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.data.Track

/** Three bars that dance while the track plays. */
@Composable
fun EqualizerBars(playing: Boolean, modifier: Modifier = Modifier) {
    val accent = LocalAccent.current
    val transition = rememberInfiniteTransition(label = "eq")
    val heights = listOf(420, 560, 480).mapIndexed { i, duration ->
        transition.animateFloat(0.25f, 1f, infiniteRepeatable(tween(duration), RepeatMode.Reverse), label = "bar$i")
    }
    Row(modifier.height(16.dp), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
        heights.forEach { h ->
            Box(
                Modifier
                    .width(3.dp)
                    .height(16.dp)
                    .graphicsLayer { scaleY = if (playing) h.value else 0.25f; transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0.5f, 1f) }
                    .clip(RoundedCornerShape(2.dp))
                    .background(accent),
            )
        }
    }
}

@Composable
fun TrackRow(
    track: Track,
    index: Int,
    active: Boolean,
    playing: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: @Composable (() -> Unit)? = null,
    menu: Boolean = true,
) {
    val accent = LocalAccent.current
    Row(
        modifier
            .fillMaxWidth()
            .appear(index)
            .clip(RoundedCornerShape(14.dp))
            .pressable(enabled = track.available, scaleTo = 0.985f, onClick = onClick)
            .background(if (active) accent.copy(alpha = 0.12f) else androidx.compose.ui.graphics.Color.Transparent)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(52.dp), contentAlignment = Alignment.Center) {
            Cover(track.coverUri, Modifier.size(52.dp), size = "100x100", radius = 10.dp)
            if (active) {
                Box(
                    Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)).background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.5f)),
                    contentAlignment = Alignment.Center,
                ) { EqualizerBars(playing) }
            }
        }
        Column(Modifier.weight(1f)) {
            Text(
                buildString {
                    append(track.title)
                    track.version?.let { append(" · $it") }
                },
                color = if (!track.available) Palette.Muted else if (active) accent else Palette.Text,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(track.artistNames, color = Palette.Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(formatTime(track.durationMs), color = Palette.Muted, fontSize = 12.sp)
        trailing?.invoke()
        if (menu) TrackMenuButton(track)
    }
}
