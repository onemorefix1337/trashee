package app.trashee.player

import android.os.Bundle
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import app.trashee.TrasheeApp
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

private const val ACTION_LIKE = "app.trashee.LIKE"
private const val ACTION_DISLIKE = "app.trashee.DISLIKE"

/** The like and dislike buttons next to the usual controls of the notification, the lock screen and the quick settings. */
private fun mediaButtons(liked: Boolean): ImmutableList<CommandButton> = ImmutableList.of(
    CommandButton.Builder(if (liked) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED)
        .setSessionCommand(SessionCommand(ACTION_LIKE, Bundle.EMPTY))
        .setDisplayName(if (liked) "Убрать из любимых" else "Нравится")
        .setSlots(CommandButton.SLOT_OVERFLOW)
        .build(),
    CommandButton.Builder(CommandButton.ICON_THUMB_DOWN_UNFILLED)
        .setSessionCommand(SessionCommand(ACTION_DISLIKE, Bundle.EMPTY))
        .setDisplayName("Не нравится")
        .setSlots(CommandButton.SLOT_OVERFLOW)
        .build(),
)

/** Keeps the music playing with the screen off and shows the notification with its controls. */
class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null
    private var follow: Job? = null

    override fun onCreate() {
        super.onCreate()
        val app = application as TrasheeApp
        val engine = app.engine
        session = MediaSession.Builder(this, engine.player)
            .setId("trashee")
            .setCallback(object : MediaSession.Callback {
                override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
                    val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
                        .add(SessionCommand(ACTION_LIKE, Bundle.EMPTY))
                        .add(SessionCommand(ACTION_DISLIKE, Bundle.EMPTY))
                        .build()
                    val liked = engine.ui.value.track?.id?.let { it in app.repo.likedIds.value } == true
                    return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                        .setAvailableSessionCommands(commands)
                        .setMediaButtonPreferences(mediaButtons(liked))
                        .build()
                }

                override fun onCustomCommand(
                    session: MediaSession,
                    controller: MediaSession.ControllerInfo,
                    customCommand: SessionCommand,
                    args: Bundle,
                ): ListenableFuture<SessionResult> {
                    when (customCommand.customAction) {
                        ACTION_LIKE -> engine.likeCurrent()
                        ACTION_DISLIKE -> engine.dislikeCurrent()
                    }
                    return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
                }
            })
            .build()

        // The heart is filled while the playing track is liked, whoever liked it: this app, the widget, a watch.
        follow = app.scope.launch {
            combine(engine.ui.map { it.track?.id }, app.repo.likedIds) { id, liked -> id != null && id in liked }
                .collect { liked -> session?.setMediaButtonPreferences(mediaButtons(liked)) }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    // Swiping the app away stops the service, unless music is playing: then it keeps going.
    override fun onTaskRemoved(rootIntent: android.content.Intent?) {
        val player = session?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        follow?.cancel()
        follow = null
        session?.release()
        session = null
        super.onDestroy()
    }
}
