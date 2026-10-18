package app.trashee.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import app.trashee.data.CollectionRef
import app.trashee.data.Loaded
import app.trashee.data.Toasts
import app.trashee.data.key
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

const val LIKED_KEY = "liked"
private const val LIKED_LIMIT = 500
private const val CONFIRM_MS = 3000L

/** "Save for offline": tracks, lyrics and covers of a collection are kept in the app. Press again to remove. */
@Composable
fun SaveOfflineButton(target: CollectionRef?, title: String) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val key = target?.key() ?: LIKED_KEY
    val saved by app.offline.saved.collectAsState()
    val progress by app.offline.progress.collectAsState()
    var confirming by remember { mutableStateOf(false) }

    LaunchedEffect(confirming) {
        if (confirming) {
            delay(CONFIRM_MS)
            confirming = false
        }
    }

    val running = progress[key]
    val isSaved = saved.any { it.key == key }
    val label = when {
        running != null -> "Сохраняем ${running.done} из ${if (running.total > 0) running.total.toString() else "…"}"
        isSaved -> if (confirming) "Убрать?" else "Сохранено"
        else -> "Сохранить офлайн"
    }

    SecondaryButton(label) {
        when {
            running != null -> app.offline.cancel(key)
            isSaved -> if (confirming) {
                confirming = false
                scope.launch { app.offline.remove(key) }
                Toasts.say("«$title» убрано из сохранённого")
            } else {
                confirming = true
            }
            else -> scope.launch {
                try {
                    app.offline.save(key) {
                        val client = app.repo.api ?: error("Нет связи")
                        if (target == null) {
                            Loaded("Мне нравится", "Любимые треки", null, client.likedTracks(LIKED_LIMIT))
                        } else {
                            val page = client.collection(target)
                            Loaded(page.title, page.subtitle, page.coverUri, page.tracks, page)
                        }
                    }
                    Toasts.say("«$title» сохранено для прослушивания без сети")
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    Toasts.say("Не удалось сохранить «$title»")
                }
            }
        }
    }
}
