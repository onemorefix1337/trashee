package app.trashee.widget

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Looper
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import app.trashee.MainActivity
import app.trashee.TrasheeApp
import app.trashee.data.Session
import app.trashee.player.PlaybackService
import app.trashee.player.PlayerEngine
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

private const val LOGIN_WAIT_MS = 8_000L
private const val SERVICE_HOLD_MS = 1_500L

/**
 * A widget tap may arrive when the app is not running. Connecting to the session starts the playback
 * service, which is what keeps the music (and its notification) alive after this callback is gone.
 */
private suspend fun startPlaybackService(context: Context) {
    val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
    val controller = withContext(Dispatchers.IO) {
        runCatching {
            MediaController.Builder(context, token)
                .setApplicationLooper(Looper.getMainLooper())
                .buildAsync()
                .get(5, TimeUnit.SECONDS)
        }.getOrNull()
    }
    delay(SERVICE_HOLD_MS)
    withContext(Dispatchers.Main) { controller?.release() }
}

private suspend fun withEngine(context: Context, block: suspend (TrasheeApp, PlayerEngine) -> Unit) {
    val app = context.applicationContext as TrasheeApp
    withContext(Dispatchers.Main) { block(app, app.engine) }
}

/** True once the saved login has been restored; false when there is none or there is no connection. */
private suspend fun signedIn(app: TrasheeApp): Boolean =
    withTimeoutOrNull(LOGIN_WAIT_MS) { app.repo.session.first { it !is Session.Restoring } } is Session.Ready

private fun openApp(context: Context) {
    context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

/** Play or pause; with nothing queued it starts Моя волна. */
class ToggleAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        withEngine(context) { app, engine ->
            if (engine.ui.value.track != null) {
                engine.toggle()
            } else if (signedIn(app)) {
                if (!engine.restore(autoplay = true)) engine.startWave()
            } else {
                openApp(context)
            }
        }
        startPlaybackService(context)
    }
}

class NextAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        withEngine(context) { _, engine -> engine.next() }
        startPlaybackService(context)
    }
}

class PreviousAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        withEngine(context) { _, engine -> engine.previous() }
        startPlaybackService(context)
    }
}

class LikeAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        withEngine(context) { _, engine -> engine.likeCurrent() }
    }
}

class WaveAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        withEngine(context) { app, engine ->
            if (signedIn(app)) engine.startWave() else openApp(context)
        }
        startPlaybackService(context)
    }
}
