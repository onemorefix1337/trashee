package app.trashee

import android.app.Application
import app.trashee.data.OfflineLibrary
import app.trashee.data.Repo
import app.trashee.player.Caches
import app.trashee.update.Updater
import app.trashee.widget.keepWidgetCurrent
import app.trashee.player.PlayerEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.intercept.Interceptor
import coil3.request.ImageRequest
import coil3.request.ImageResult

class TrasheeApp : Application() {
    /** Work that must outlive any one screen: saving a collection, downloading a file. */
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    lateinit var repo: Repo
        private set
    lateinit var updater: Updater
        private set
    lateinit var caches: Caches
        private set
    lateinit var offline: OfflineLibrary
        private set
    lateinit var engine: PlayerEngine
        private set
    lateinit var sync: app.trashee.sync.SyncController
        private set

    /** A Yandex Music link that opened or was shared to the app; the main screen takes it as soon as there is one. */
    val incomingLink = kotlinx.coroutines.flow.MutableStateFlow<app.trashee.api.YandexLink?>(null)

    override fun onCreate() {
        super.onCreate()
        repo = Repo(this, scope)
        caches = Caches(this, repo)
        offline = OfflineLibrary(this, caches) { track -> repo.lyrics(track) }
        repo.offline = offline
        engine = PlayerEngine(this, repo, caches, scope)

        // Covers saved with a collection are used first, so they show up without a connection too.
        SingletonImageLoader.setSafe {
            ImageLoader.Builder(this)
                .components { add(OfflineCovers(offline)) }
                .build()
        }
        sync = app.trashee.sync.SyncController(this)
        sync.start()
        keepWidgetCurrent(this)
        updater = Updater(this, scope)
        updater.startBackgroundChecks()
        repo.restore()
    }
}

/** Looks a cover up among the saved ones before the image loader goes to the network. */
private class OfflineCovers(private val library: OfflineLibrary) : Interceptor {
    override suspend fun intercept(chain: Interceptor.Chain): ImageResult {
        val data = chain.request.data
        val saved = (data as? String)?.let(library::coverFor)
        if (saved == null) return chain.proceed()
        val request: ImageRequest = chain.request.newBuilder().data(saved).build()
        return chain.withRequest(request).proceed()
    }
}
