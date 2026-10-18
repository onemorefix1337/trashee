package app.trashee.player

import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import app.trashee.TrasheeApp

/** Keeps the music playing with the screen off and shows the notification with its controls. */
class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val engine = (application as TrasheeApp).engine
        session = MediaSession.Builder(this, engine.player).setId("trashee").build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    // Swiping the app away stops the service, unless music is playing: then it keeps going.
    override fun onTaskRemoved(rootIntent: android.content.Intent?) {
        val player = session?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        session?.release()
        session = null
        super.onDestroy()
    }
}
