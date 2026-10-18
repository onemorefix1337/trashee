package app.trashee.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.trashee.R
import app.trashee.data.Track
import kotlinx.coroutines.launch

@Composable
fun LikeButton(track: Track, modifier: Modifier = Modifier, iconSize: Dp = 24.dp, box: Dp = 44.dp) {
    val repo = LocalApp.current.repo
    val scope = rememberCoroutineScope()
    val liked = track.id in repo.likedIds.collectAsState().value
    // A little pop when the heart fills.
    val pop by animateFloatAsState(
        if (liked) 1f else 0.85f,
        spring(dampingRatio = Spring.DampingRatioHighBouncy, stiffness = Spring.StiffnessMedium),
        label = "pop",
    )
    IconAction(
        id = if (liked) R.drawable.ic_heart_filled else R.drawable.ic_heart,
        label = if (liked) "Убрать лайк" else "Нравится",
        tint = if (liked) Palette.Heart else Palette.Muted,
        iconSize = iconSize,
        box = box,
        modifier = modifier.graphicsLayer { scaleX = pop; scaleY = pop },
    ) { scope.launch { repo.toggleLike(track) } }
}
