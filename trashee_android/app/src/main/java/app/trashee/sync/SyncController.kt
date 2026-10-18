package app.trashee.sync

import android.content.Context
import android.media.AudioManager
import android.os.Build
import app.trashee.TrasheeApp
import app.trashee.data.Toasts
import app.trashee.data.TokenStore
import app.trashee.data.Track
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

private const val LOOKUP_CHUNK = 100
private const val REFRESH_MS = 15_000L
private const val HANDOVER_LAG_MS = 300L

/**
 * Joins the player to the link with the computer: tells it what plays here, does what it asks (buttons, taking over,
 * handing over) and offers to take over when it starts playing while the phone is quiet.
 */
class SyncController(private val app: TrasheeApp) {
    private val prefs = app.getSharedPreferences("sync", Context.MODE_PRIVATE)
    private val store = TokenStore(app, "sync_secret", "trashee_sync")

    val deviceId: String = prefs.getString("deviceId", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("deviceId", it).apply() }
    val deviceName: String = "${Build.MANUFACTURER} ${Build.MODEL}".trim().replaceFirstChar { it.uppercase() }

    private val _paired = MutableStateFlow(loadPairing())
    /** The computer this phone is paired with, if any. */
    val paired: StateFlow<Pairing?> = _paired.asStateFlow()

    val link = SyncLink(app.scope, relocate = { serverId ->
        discoverComputers(app).firstOrNull { it.id == serverId }?.address
    })
    val state: StateFlow<LinkState> get() = link.state
    val host: StateFlow<NowPlaying?> get() = link.host

    private fun loadPairing(): Pairing? = store.load()?.let {
        try {
            syncJson.decodeFromString<Pairing>(it)
        } catch (_: Exception) {
            null
        }
    }

    private fun save(pairing: Pairing?) {
        if (pairing == null) store.clear() else store.save(syncJson.encodeToString(pairing))
        _paired.value = pairing
    }

    /** Pairs with a computer and keeps the connection to it from now on. */
    suspend fun pair(address: String, code: String) {
        val pairing = pairWithComputer(address.trim().removePrefix("http://"), code.trim().replace(" ", ""), deviceId, deviceName)
        save(pairing)
        link.connect(pairing)
    }

    /** Forgets the computer; it has to be told separately (in its settings) to forget this phone. */
    fun unpair() {
        link.disconnect()
        save(null)
    }

    @OptIn(FlowPreview::class)
    fun start() {
        link.onRelocated = { save(it) }
        link.onCommand = { _, command -> app.scope.launch { apply(command) } }
        link.onHandoff = { handoff -> app.scope.launch { receive(handoff) } }
        link.onPull = { from -> app.scope.launch { handOver(from.id) } }
        _paired.value?.let(link::connect)

        // A pairing the computer has dropped is dropped here too.
        app.scope.launch {
            link.state.collect { if (it == LinkState.Forgotten) save(null) }
        }
        // What plays here is told to the computer whenever it changes, and now and then so the two stay close.
        app.scope.launch {
            combine(
                app.engine.ui.map { Triple(it.track?.id, it.playing, it.index to it.queue.size) }.distinctUntilChanged(),
                app.engine.seeks,
                link.state.map { it is LinkState.Online }.distinctUntilChanged(),
            ) { _, _, online -> online }
                .debounce(300)
                .collect { online -> if (online) publish() }
        }
        app.scope.launch {
            while (true) {
                delay(REFRESH_MS)
                if (app.engine.ui.value.playing && link.state.value is LinkState.Online) publish()
            }
        }
        // The computer starts playing while this phone is silent: offer to take it over.
        app.scope.launch {
            var before: NowPlaying? = null
            link.host.collect { now ->
                val started = now?.playing == true && before?.playing != true && now.track != null
                if (started && !app.engine.ui.value.playing) {
                    Toasts.say("Играет на «${now.name.ifEmpty { "компьютере" }}»: ${now.track?.title}", "Забрать") { app.scope.launch { pull() } }
                }
                before = now
            }
        }
    }

    /** What plays here, in the words the computer understands; null when nothing is queued. */
    fun describe(): NowPlaying? {
        val ui = app.engine.ui.value
        val track = ui.track ?: return null
        return NowPlaying(
            track = track.toSync(),
            playing = ui.playing,
            positionMs = app.engine.player.currentPosition,
            at = System.currentTimeMillis(),
            queueLength = ui.queue.size,
            index = ui.index,
        )
    }

    private suspend fun publish() {
        link.postState(describe() ?: NowPlaying())
    }

    private fun apply(command: SyncCommand) {
        val engine = app.engine
        when (command.cmd) {
            "toggle" -> engine.toggle()
            "play" -> if (!engine.ui.value.playing) engine.toggle()
            "pause" -> if (engine.ui.value.playing) engine.toggle()
            "next" -> engine.next()
            "prev" -> engine.previous()
            "seek" -> engine.seekTo(command.value?.toLong() ?: 0L)
            "volume" -> {
                val audio = app.getSystemService(AudioManager::class.java)
                val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                audio.setStreamVolume(AudioManager.STREAM_MUSIC, ((command.value ?: 1.0) * max).toInt().coerceIn(0, max), 0)
            }
            "like" -> engine.likeCurrent()
            "dislike" -> engine.dislikeCurrent()
        }
    }

    /** Takes over a listening session the computer sent: same queue, same track, same second. */
    private suspend fun receive(handoff: Handoff) {
        val started = System.currentTimeMillis()
        try {
            val client = app.repo.api ?: error("Нет связи")
            val found = coroutineScope {
                handoff.queue.chunked(LOOKUP_CHUNK).map { async { client.tracks(it) } }.awaitAll().flatten()
            }.associateBy { it.id }
            val queue = handoff.queue.mapNotNull { found[it] }
            if (queue.isEmpty()) error("empty")
            val wanted = handoff.queue.getOrNull(handoff.index)
            val index = queue.indexOfFirst { it.id == wanted }.coerceAtLeast(0)
            val lag = if (handoff.playing) System.currentTimeMillis() - started + HANDOVER_LAG_MS else 0L
            app.engine.playTracks(queue, index, handoff.positionMs + lag, handoff.playing)
            Toasts.say("Играет с «${handoff.fromName.ifEmpty { "компьютера" }}»")
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            Toasts.say("Не удалось принять музыку с компьютера")
        }
    }

    /** Sends what plays here to [target] ("host" is the computer) and, once it has it, stops here. */
    suspend fun handOver(target: String = "host"): Boolean {
        val ui = app.engine.ui.value
        val track = ui.track
        if (track == null) {
            Toasts.say("Сейчас ничего не играет")
            return false
        }
        val (items, index) = handoffWindow(ui.queue, ui.index)
        val handoff = Handoff(
            queue = items.map(Track::id),
            index = index,
            positionMs = app.engine.player.currentPosition,
            at = System.currentTimeMillis(),
            playing = ui.playing,
            tracks = items.drop(index).take(HANDOFF_INLINE).map(Track::toSync),
        )
        val delivered = link.handoff(target, handoff)
        if (delivered) {
            if (app.engine.ui.value.playing) app.engine.toggle()
            Toasts.say("Передано на компьютер")
        } else {
            Toasts.say("Компьютер не в сети")
        }
        return delivered
    }

    /** Asks the computer to hand over what it plays. */
    suspend fun pull(target: String = "host"): Boolean {
        val delivered = link.pull(target)
        if (!delivered) Toasts.say("Компьютер не в сети")
        return delivered
    }

    suspend fun control(command: SyncCommand, target: String = "host"): Boolean = link.command(target, command)
}
