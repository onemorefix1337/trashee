package app.trashee.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.data.CollectionRef
import app.trashee.data.Toasts
import app.trashee.data.Track

sealed interface ShareItem {
    data class TrackItem(val track: Track) : ShareItem
    data class CollectionItem(val title: String, val subtitle: String?, val ref: CollectionRef) : ShareItem
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareSheet(item: ShareItem, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val accent = LocalAccent.current

    val (title, subtitle, trasheeLink, webLink) = when (item) {
        is ShareItem.TrackItem -> {
            val track = item.track
            val albumId = track.albums.firstOrNull()?.id
            val tLink = if (albumId != null) "trashee://album/$albumId/track/${track.id}" else "trashee://track/${track.id}"
            val wLink = if (albumId != null) "https://music.yandex.ru/album/$albumId/track/${track.id}" else "https://music.yandex.ru/track/${track.id}"
            Quadruple(track.title, track.artistNames, tLink, wLink)
        }
        is ShareItem.CollectionItem -> {
            val (tLink, wLink) = when (val ref = item.ref) {
                is CollectionRef.AlbumRef -> "trashee://album/${ref.id}" to "https://music.yandex.ru/album/${ref.id}"
                is CollectionRef.ArtistRef -> "trashee://artist/${ref.id}" to "https://music.yandex.ru/artist/${ref.id}"
                is CollectionRef.Playlist -> {
                    if (ref.uuid != null) {
                        "trashee://playlist/${ref.uuid}" to "https://music.yandex.ru/playlists/${ref.uuid}"
                    } else if (ref.login != null && ref.kind != null) {
                        "trashee://users/${ref.login}/playlists/${ref.kind}" to "https://music.yandex.ru/users/${ref.login}/playlists/${ref.kind}"
                    } else {
                        "trashee://playlist/${ref.kind}" to "https://music.yandex.ru"
                    }
                }
            }
            Quadruple(item.title, item.subtitle.orEmpty(), tLink, wLink)
        }
    }

    fun copyToClipboard(text: String, label: String = "Ссылка скопирована") {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("trashee link", text))
        Toasts.say(label)
    }

    fun shareViaSystem(url: String, subject: String) {
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, "$subject\n$url")
        }
        context.startActivity(Intent.createChooser(sendIntent, "Поделиться"))
        onDismiss()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.Surface,
    ) {
        Column(
            modifier = Modifier
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column {
                Text(
                    text = "Поделиться",
                    color = Palette.Muted,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = title,
                    color = Palette.Text,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (subtitle.isNotEmpty()) {
                    Text(
                        text = subtitle,
                        color = Palette.Muted,
                        fontSize = 14.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Palette.SurfaceHover)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Ссылка для trashee",
                    color = Palette.Muted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = trasheeLink,
                    color = accent,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(42.dp)
                            .clip(RoundedCornerShape(21.dp))
                            .background(accent)
                            .clickable {
                                copyToClipboard(trasheeLink, "Ссылка trashee скопирована")
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Скопировать",
                            color = Color.Black,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(42.dp)
                            .clip(RoundedCornerShape(21.dp))
                            .background(Palette.Line)
                            .clickable {
                                shareViaSystem(trasheeLink, if (subtitle.isNotEmpty()) "$title — $subtitle" else title)
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Отправить",
                            color = Palette.Text,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(Palette.SurfaceHover)
                    .clickable {
                        shareViaSystem(webLink, if (subtitle.isNotEmpty()) "$title — $subtitle" else title)
                    },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Или же для обычной яндекс музыки",
                    color = Palette.Text,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

private data class Quadruple<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)
