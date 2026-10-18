package app.trashee.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.R
import app.trashee.api.parseYandexLink
import app.trashee.data.Track
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

private sealed interface SearchState {
    data object Idle : SearchState
    data object Loading : SearchState
    data class Done(val tracks: List<Track>) : SearchState
    data object Failed : SearchState
}

@Composable
fun SearchScreen(padding: PaddingValues) {
    val app = LocalApp.current
    val ui by app.engine.ui.collectAsState()
    var query by rememberSaveable { mutableStateOf("") }
    var state by remember { mutableStateOf<SearchState>(SearchState.Idle) }
    val focus = LocalFocusManager.current
    val requester = remember { FocusRequester() }
    val accent = LocalAccent.current

    val nav = LocalNav.current
    LaunchedEffect(query) {
        val text = query.trim()
        if (text.isEmpty()) {
            state = SearchState.Idle
            return@LaunchedEffect
        }
        // A pasted Yandex Music link is opened instead of searched for.
        parseYandexLink(text)?.let { link ->
            delay(200)
            query = ""
            openYandexLink(app, nav, link)
            return@LaunchedEffect
        }
        delay(400)
        state = SearchState.Loading
        state = try {
            SearchState.Done((app.repo.api ?: error("Нет связи")).search(text))
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            SearchState.Failed
        }
    }

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Text("Поиск", color = Palette.Text, fontSize = 34.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp), fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
        Row(
            Modifier
                .padding(horizontal = 20.dp)
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .clip(RoundedCornerShape(26.dp))
                .background(Palette.SurfaceHover)
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Ic(R.drawable.ic_search, tint = Palette.Muted, size = 22.dp)
            Box(Modifier.weight(1f)) {
                if (query.isEmpty()) Text("Треки, исполнители или ссылка на Яндекс Музыку", color = Palette.Muted, fontSize = 16.sp, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = TextStyle(color = Palette.Text, fontSize = 16.sp),
                    cursorBrush = SolidColor(accent),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { focus.clearFocus() }),
                    modifier = Modifier.fillMaxWidth().focusRequester(requester),
                )
            }
            if (query.isNotEmpty()) {
                IconAction(R.drawable.ic_close, "Очистить", tint = Palette.Muted, iconSize = 18.dp, box = 32.dp) { query = "" }
            }
        }

        Box(Modifier.fillMaxSize()) {
            when (val s = state) {
                SearchState.Idle -> Text(
                    "Найди любой трек и включи его", color = Palette.Muted, fontSize = 14.sp,
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = 48.dp),
                )
                SearchState.Loading -> CircularProgressIndicator(
                    color = accent, modifier = Modifier.align(Alignment.TopCenter).padding(top = 48.dp).size(28.dp),
                )
                SearchState.Failed -> Text(
                    "Не удалось выполнить поиск", color = Palette.Danger, fontSize = 14.sp,
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = 48.dp),
                )
                is SearchState.Done -> if (s.tracks.isEmpty()) {
                    Text("Ничего не найдено", color = Palette.Muted, fontSize = 14.sp, modifier = Modifier.align(Alignment.TopCenter).padding(top = 48.dp))
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(top = 12.dp, start = 8.dp, end = 8.dp, bottom = padding.calculateBottomPadding() + 16.dp),
                    ) {
                        itemsIndexed(s.tracks, key = { i, t -> "${t.id}#$i" }) { index, track ->
                            TrackRow(
                                track, index,
                                active = ui.track?.id == track.id, playing = ui.playing,
                                onClick = { focus.clearFocus(); app.engine.playTracks(s.tracks, index) },
                                trailing = { LikeButton(track, iconSize = 22.dp, box = 40.dp) },
                            )
                        }
                    }
                }
            }
        }
    }
}
