package app.trashee.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.R
import app.trashee.data.Pin
import app.trashee.data.PinType
import app.trashee.data.Session

@Composable
fun CoverCard(coverUri: String?, title: String, subtitle: String, round: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(modifier.width(132.dp).pressable(scaleTo = 0.95f, onClick = onClick)) {
        Cover(coverUri, Modifier.size(132.dp), size = "200x200", radius = 16.dp, round = round)
        Spacer(Modifier.height(8.dp))
        Text(title, color = Palette.Text, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(subtitle, color = Palette.Muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun WaveScreen(padding: PaddingValues) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val ui by app.engine.ui.collectAsState()
    val pins by app.repo.pins.collectAsState()
    val liked by app.repo.liked.collectAsState()
    val session by app.repo.session.collectAsState()
    val login = (session as? Session.Ready)?.account?.login.orEmpty()
    val accent = LocalAccent.current
    val waveOn = ui.wave && ui.playing

    LazyColumn(
        Modifier.statusBarsPadding(),
        contentPadding = PaddingValues(bottom = padding.calculateBottomPadding() + 16.dp),
    ) {
        item {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                Text(if (login.isEmpty()) "Привет" else "Привет, $login", color = Palette.Muted, fontSize = 14.sp)
                Text("Моя волна", color = Palette.Text, fontSize = 34.sp, fontWeight = FontWeight.Bold)
            }
        }
        item {
            Box(
                Modifier
                    .padding(horizontal = 20.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(28.dp))
                    .background(BrandGradient)
                    .pressable(scaleTo = 0.98f) { if (ui.wave) app.engine.toggle() else app.engine.startWave() }
                    .padding(24.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            if (waveOn) "Играет волна" else "Бесконечное радио",
                            color = Color.Black, fontSize = 22.sp, fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            if (waveOn) "Нажми, чтобы поставить на паузу" else "Подбирается под твой вкус и настроение",
                            color = Color.Black.copy(alpha = 0.7f), fontSize = 14.sp,
                        )
                    }
                    Box(Modifier.size(64.dp).clip(CircleShape).background(Color.Black), contentAlignment = Alignment.Center) {
                        when {
                            ui.loading && !ui.playing -> CircularProgressIndicator(color = Color.White, strokeWidth = 3.dp, modifier = Modifier.size(28.dp))
                            waveOn -> Ic(R.drawable.ic_pause, tint = Color.White, size = 30.dp)
                            else -> Ic(R.drawable.ic_play, tint = Color.White, size = 30.dp)
                        }
                    }
                }
            }
            ui.error?.takeIf { ui.queue.isEmpty() || ui.wave }?.let {
                Text(it, color = Palette.Danger, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
            }
        }

        val pinned = pins.orEmpty()
        if (pinned.isNotEmpty()) {
            item { Spacer(Modifier.height(20.dp)); SectionTitle("Закреплённое") }
            item {
                LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    itemsIndexed(pinned, key = { _, pin -> pin.key }) { index, pin ->
                        CoverCard(
                            pin.coverUri, pin.title, pin.subtitle, round = pin.type == PinType.Artist,
                            modifier = Modifier.appear(index),
                        ) { openPin(pin, app, nav) }
                    }
                }
            }
        }

        val likedTracks = liked.orEmpty()
        if (likedTracks.isNotEmpty()) {
            item { Spacer(Modifier.height(20.dp)); SectionTitle("Мне нравится") }
            itemsIndexed(likedTracks.take(6), key = { _, t -> "liked-${t.id}" }) { index, track ->
                TrackRow(
                    track, index,
                    active = ui.track?.id == track.id, playing = ui.playing,
                    onClick = { app.engine.playTracks(likedTracks, index) },
                    modifier = Modifier.padding(horizontal = 8.dp),
                )
            }
            if (likedTracks.size > 6) {
                item {
                    Box(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                        SecondaryButton("Показать все") { nav.tab(Route.Library) }
                    }
                }
            }
        }
    }
}

private fun openPin(pin: Pin, app: app.trashee.TrasheeApp, nav: Nav) {
    when {
        pin.type == PinType.Wave -> if (pin.seed != null) app.engine.startWave(pin.seed)
        pin.ref != null -> nav.push(Route.Collection(pin.ref))
    }
}
