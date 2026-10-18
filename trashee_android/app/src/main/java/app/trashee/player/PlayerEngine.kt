@file:OptIn(UnstableApi::class)

package app.trashee.player

import android.app.Application
import android.content.Context
import android.net.Uri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.ShuffleOrder
import android.os.SystemClock
import app.trashee.BuildConfig
import app.trashee.data.Repo
import app.trashee.data.Toasts
import app.trashee.data.VISUALIZER_SHIFT_MAX_MS
import app.trashee.data.Track
import app.trashee.data.WaveEvent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.random.Random

private const val MAX_CONSECUTIVE_ERRORS = 3
private const val WAVE_REFILL_AT = 2
private const val POSITION_TICK_MS = 250L
private const val SAVE_EVERY_TICKS = 16
private const val RESTART_THRESHOLD_MS = 3000L
private const val PREFETCH_LAST_MS = 45_000L
// The audio buffer is nearly, not quite, full while playing; and an upper bound for odd devices.
private const val OUTPUT_FILL_MARGIN_MS = 30L
private const val MAX_OUTPUT_DELAY_MS = 800L

fun coverUrl(coverUri: String?, size: String = "400x400"): String? = coverUri?.let {
    // Real covers are bare "host/path" templates. A debug build may be pointed at a test server over plain http.
    if (BuildConfig.DEBUG && it.startsWith("http://")) it else "https://${it.replace("%%", size)}"
}

data class PlayerUi(
    val queue: List<Track> = emptyList(),
    val index: Int = -1,
    val playing: Boolean = false,
    val loading: Boolean = false,
    val shuffle: Boolean = false,
    val repeat: Int = Player.REPEAT_MODE_OFF,
    val durationMs: Long = 0,
    val wave: Boolean = false,
    val error: String? = null,
) {
    val track: Track? get() = queue.getOrNull(index)
}

private class WaveSession(val id: String, var batchId: String)

/** The one player of the app: the queue, Моя волна, likes. The notification and lock screen mirror it. */
class PlayerEngine(
    app: Application,
    private val repo: Repo,
    private val caches: Caches,
    private val scope: CoroutineScope,
) {
    /** What the visualizer draws: measured from the sound this player outputs. */
    val spectrum = SpectrumProcessor()

    /** The ten-band equalizer; it sits in front of the measurement, so the visualizer shows what is heard. */
    private val equalizer = EqualizerProcessor()

    val player: ExoPlayer = run {
        val renderers = object : DefaultRenderersFactory(app) {
            override fun buildAudioSink(context: Context, enableFloatOutput: Boolean, enableAudioTrackPlaybackParams: Boolean): AudioSink =
                DefaultAudioSink.Builder(context)
                    .setEnableFloatOutput(false) // the measurement reads 16-bit samples
                    .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                    .setAudioProcessors(arrayOf(equalizer, spectrum))
                    .build()
        }
        ExoPlayer.Builder(app, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(caches.playback))
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
    }

    private val _ui = MutableStateFlow(PlayerUi())
    val ui: StateFlow<PlayerUi> = _ui.asStateFlow()

    private val _position = MutableStateFlow(0L)
    val position: StateFlow<Long> = _position.asStateFlow()

    private val _outputDelayMs = MutableStateFlow(0L)
    /** How long the audio output holds the sound before it is heard, as far as the player can tell. */
    val outputDelayMs: StateFlow<Long> = _outputDelayMs.asStateFlow()

    private val _seeks = MutableStateFlow(0)
    /** Counts seeks, so whoever shows the position elsewhere (the paired computer) knows to refresh it. */
    val seeks: StateFlow<Int> = _seeks.asStateFlow()

    private val _sleep = MutableStateFlow<Sleep>(Sleep.Off)
    /** The sleep timer: off, counting down, or waiting for the current track to end. */
    val sleep: StateFlow<Sleep> = _sleep.asStateFlow()
    private var sleepJob: Job? = null


    private var wave: WaveSession? = null
    private var refilling = false
    private var consecutiveErrors = 0
    private var lastTrack: Track? = null
    private var lastPositionMs = 0L
    private var prefetchedFor: String? = null

    private val memory = PlaybackMemory(app)
    private var saveTick = 0

    /** Queue positions already played in this pass of the shuffle: they wait until the others have had their turn. */
    private val heard = HashSet<Int>()
    private val random = Random.Default

    init {
        // The sound waits in the audio output's buffer before it is heard: the bars are shown that much later.
        player.addAnalyticsListener(object : AnalyticsListener {
            override fun onAudioTrackInitialized(eventTime: AnalyticsListener.EventTime, audioTrackConfig: AudioSink.AudioTrackConfig) {
                val bytesPerFrame = Integer.bitCount(audioTrackConfig.channelConfig).coerceAtLeast(1) * 2
                val bufferMs = audioTrackConfig.bufferSize * 1000L / (bytesPerFrame * audioTrackConfig.sampleRate.coerceAtLeast(1))
                _outputDelayMs.value = (bufferMs - OUTPUT_FILL_MARGIN_MS).coerceIn(0L, MAX_OUTPUT_DELAY_MS)
            }
        })
        player.addListener(object : Player.Listener {
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                val index = player.currentMediaItemIndex
                prefetchedFor = null
                _ui.update { it.copy(index = index, error = null, durationMs = it.queue.getOrNull(index)?.durationMs ?: 0) }
                _position.value = 0
                heard.add(index)
                if (player.shuffleModeEnabled && player.repeatMode == Player.REPEAT_MODE_ALL && heard.size >= player.mediaItemCount) {
                    // The pass is over. The next one is a new random order, and it starts with something else than this track.
                    heard.clear()
                    heard.add(index)
                    applyShuffle()
                }
                rememberPlace()
                val track = _ui.value.track
                val previous = lastTrack
                lastTrack = track
                if (wave != null && track != null) {
                    if (previous != null && previous.id != track.id) {
                        when (reason) {
                            Player.MEDIA_ITEM_TRANSITION_REASON_AUTO ->
                                feedback(WaveEvent.TrackFinished, previous, previous.durationMs / 1000.0)
                            Player.MEDIA_ITEM_TRANSITION_REASON_SEEK ->
                                feedback(WaveEvent.Skip, previous, lastPositionMs / 1000.0)
                        }
                    }
                    feedback(WaveEvent.TrackStarted, track)
                    if (_ui.value.queue.size - index <= WAVE_REFILL_AT) refillWave()
                }
            }

            override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
                if (reason == Player.DISCONTINUITY_REASON_SEEK || reason == Player.DISCONTINUITY_REASON_SEEK_ADJUSTMENT) {
                    _seeks.update { it + 1 }
                }
            }

            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                // "After this track" pauses by itself at the end of the item; that is the moment the timer is done.
                if (reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM && _sleep.value == Sleep.AfterTrack) {
                    player.pauseAtEndOfMediaItems = false
                    _sleep.value = Sleep.Off
                    Toasts.say("Таймер сна: музыка остановлена")
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) consecutiveErrors = 0
                _ui.update { it.copy(playing = isPlaying) }
                if (!isPlaying) rememberPlace()
            }

            override fun onPlaybackStateChanged(state: Int) {
                _ui.update { it.copy(loading = state == Player.STATE_BUFFERING) }
                if (state == Player.STATE_READY && player.duration != C.TIME_UNSET) {
                    _ui.update { it.copy(durationMs = player.duration) }
                }
            }

            override fun onShuffleModeEnabledChanged(enabled: Boolean) {
                _ui.update { it.copy(shuffle = enabled) }
                heard.clear()
                if (enabled) {
                    heard.add(player.currentMediaItemIndex)
                    applyShuffle()
                }
                rememberPlace()
            }

            override fun onRepeatModeChanged(mode: Int) {
                _ui.update { it.copy(repeat = mode) }
                rememberPlace()
            }

            override fun onPlayerError(error: PlaybackException) {
                consecutiveErrors += 1
                _ui.update { it.copy(playing = false, loading = false, error = "Не удалось воспроизвести трек") }
                if (consecutiveErrors < MAX_CONSECUTIVE_ERRORS && player.hasNextMediaItem()) {
                    scope.launch {
                        delay(800)
                        player.seekToNextMediaItem()
                        player.prepare()
                        player.play()
                    }
                }
            }
        })

        scope.launch { repo.eqGains.collect { equalizer.setGains(it) } }
        scope.launch { repo.visualizerOn.collect { spectrum.enabled = it } }
        // What the bars wait for: what the player says plus the user's own adjustment (Bluetooth adds delay nobody can measure).
        scope.launch {
            combine(_outputDelayMs, repo.visualizerShiftMs) { auto, shift -> (auto + shift).coerceIn(0L, MAX_OUTPUT_DELAY_MS + VISUALIZER_SHIFT_MAX_MS) }
                .collect { spectrum.outputDelayMs = it }
        }

        scope.launch {
            while (true) {
                delay(POSITION_TICK_MS)
                if (player.isPlaying) {
                    lastPositionMs = player.currentPosition
                    _position.value = lastPositionMs
                    maybePrefetch()
                    if (++saveTick % SAVE_EVERY_TICKS == 0) rememberPlace()
                }
            }
        }
    }

    /** Fetches the next track in the background from the middle of this one at the latest, so it starts without waiting. */
    private fun maybePrefetch() {
        if (!repo.prefetchNext.value) return
        val nextIndex = player.nextMediaItemIndex // follows the shuffled order too
        if (nextIndex == C.INDEX_UNSET) return
        val upcoming = _ui.value.queue.getOrNull(nextIndex) ?: return
        if (upcoming.id == prefetchedFor || !upcoming.available) return
        val duration = player.duration
        if (duration == C.TIME_UNSET || duration <= 0) return
        if (duration - player.currentPosition <= PREFETCH_LAST_MS || player.currentPosition >= duration / 2) {
            prefetchedFor = upcoming.id
            caches.prefetch(upcoming.id, scope)
        }
    }

    private fun mediaItem(track: Track): MediaItem = MediaItem.Builder()
        .setMediaId(track.id)
        .setUri(trackUri(track.id))
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(track.title)
                .setArtist(track.artistNames)
                .setAlbumTitle(track.albums.firstOrNull()?.title)
                .setArtworkUri(coverUrl(track.coverUri)?.let(Uri::parse))
                .setDurationMs(track.durationMs)
                .setIsPlayable(true)
                .build(),
        )
        .build()

    /* ---------- wave feedback ---------- */

    private fun feedback(type: WaveEvent, track: Track?, playedSeconds: Double? = null) {
        val session = wave ?: return
        scope.launch {
            runCatching { repo.api?.waveFeedback(session.id, session.batchId, type, track?.id, playedSeconds) }
        }
    }

    private fun refillWave() {
        val session = wave ?: return
        val track = _ui.value.track ?: return
        if (refilling) return
        refilling = true
        scope.launch {
            try {
                val batch = repo.api?.waveNext(session.id, track.id) ?: return@launch
                if (wave !== session) return@launch
                val known = _ui.value.queue.map { it.id }.toSet()
                val fresh = batch.tracks.filter { it.available && it.id !in known }
                session.batchId = batch.batchId
                if (fresh.isNotEmpty()) {
                    _ui.update { it.copy(queue = it.queue + fresh) }
                    player.addMediaItems(fresh.map(::mediaItem))
                    rememberQueue()
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                // the next track change will retry
            } finally {
                refilling = false
            }
        }
    }

    /* ---------- starting playback ---------- */

    /** [startPositionMs] and [autoplay] are for a session taken over from the computer: the same second, playing or paused. */
    fun playTracks(tracks: List<Track>, startIndex: Int = 0, startPositionMs: Long = 0, autoplay: Boolean = true, prepare: Boolean = true) {
        val playable = tracks.filter { it.available }
        val start = playable.indexOf(tracks.getOrNull(startIndex))
        if (playable.isEmpty() || start < 0) return
        wave = null
        lastTrack = null
        consecutiveErrors = 0
        _ui.update { it.copy(queue = playable, index = start, wave = false, error = null, durationMs = playable[start].durationMs) }
        player.setMediaItems(playable.map(::mediaItem), start, startPositionMs)
        player.shuffleModeEnabled = _ui.value.shuffle
        heard.clear()
        heard.add(start)
        applyShuffle()
        _position.value = startPositionMs
        if (prepare) player.prepare()
        if (autoplay) player.play() else player.pause()
        rememberQueue()
    }

    /**
     * Puts back what was playing when the app was last closed: the same track and second, and the shuffle and repeat
     * as they were. Does nothing when something is queued already or there is nothing to put back.
     */
    suspend fun restore(autoplay: Boolean): Boolean {
        if (_ui.value.queue.isNotEmpty()) return false
        val saved = withContext(Dispatchers.IO) { memory.load() } ?: return false
        if (_ui.value.queue.isNotEmpty()) return false
        player.shuffleModeEnabled = saved.shuffle
        player.repeatMode = saved.repeat
        // Paused, the player is not even prepared: nothing is downloaded until the music is asked for.
        playTracks(saved.tracks, saved.index, saved.positionMs, autoplay = autoplay, prepare = autoplay)
        return _ui.value.queue.isNotEmpty()
    }

    /** Writes down where playback is right now, for when the app is about to go away. */
    fun flush() = rememberPlace()

    private fun rememberQueue() {
        val ui = _ui.value
        if (ui.queue.isEmpty()) return
        memory.saveQueue(ui.queue, ui.index) { write -> scope.launch(Dispatchers.IO) { runCatching { write() } } }
        rememberPlace()
    }

    private fun rememberPlace() {
        val ui = _ui.value
        if (ui.index < 0 || ui.queue.isEmpty()) return
        memory.savePlace(ui.index, player.currentPosition, player.shuffleModeEnabled, player.repeatMode)
    }

    /** Plays the rest of the queue in a fresh random order that begins with the current track, and then [front]. */
    private fun applyShuffle(front: List<Int> = emptyList()) {
        val count = player.mediaItemCount
        if (!player.shuffleModeEnabled || count < 2) return
        val order = shuffleOrder(count, player.currentMediaItemIndex, front, heard, random)
        player.setShuffleOrder(ShuffleOrder.DefaultShuffleOrder(order, random.nextLong()))
    }

    fun startWave(seed: String? = null) {
        scope.launch {
            _ui.update { it.copy(loading = true, error = null) }
            try {
                val client = repo.api ?: error("Не выполнен вход")
                val batch = if (seed != null) client.waveStart(seed) else client.waveStart()
                val tracks = batch.tracks.filter { it.available }
                if (tracks.isEmpty()) error("empty wave")
                consecutiveErrors = 0
                lastTrack = null
                wave = WaveSession(batch.sessionId, batch.batchId)
                player.shuffleModeEnabled = false
                _ui.update { it.copy(queue = tracks, index = 0, wave = true, loading = false, durationMs = tracks[0].durationMs) }
                feedback(WaveEvent.RadioStarted, null)
                player.setMediaItems(tracks.map(::mediaItem), 0, 0)
                player.prepare()
                player.play()
                rememberQueue()
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                _ui.update { it.copy(loading = false, error = "Не удалось запустить Мою волну") }
            }
        }
    }

    /** Puts tracks right after the current one and leaves the rest of the queue as it was. */
    fun enqueueNext(tracks: List<Track>) {
        val playable = tracks.filter { it.available }
        val state = _ui.value
        if (state.index < 0) {
            playTracks(playable)
            return
        }
        val upcoming = state.queue.drop(state.index + 1).map { it.id }.toSet()
        val fresh = playable.filter { it.id != state.track?.id && it.id !in upcoming }
        if (fresh.isEmpty()) {
            Toasts.say("Эти треки уже в очереди")
            return
        }
        val at = state.index + 1
        _ui.update { it.copy(queue = it.queue.take(at) + fresh + it.queue.drop(at)) }
        player.addMediaItems(at, fresh.map(::mediaItem))
        if (player.shuffleModeEnabled) {
            // Positions after the new ones moved along; what was asked to play next plays next, shuffled or not.
            val moved = heard.map { if (it >= at) it + fresh.size else it }
            heard.clear()
            heard.addAll(moved)
            applyShuffle(front = (at until at + fresh.size).toList())
        }
        rememberQueue()
        Toasts.say("Добавлено в очередь: ${fresh.size}")
    }

    /* ---------- controls ---------- */

    fun toggle() {
        if (player.mediaItemCount == 0) return
        if (player.isPlaying) {
            player.pause()
        } else {
            if (player.playbackState == Player.STATE_IDLE) player.prepare()
            player.play()
        }
    }

    fun next() {
        when {
            player.hasNextMediaItem() -> player.seekToNextMediaItem()
            wave != null -> scope.launch {
                refillWave()
                delay(1200)
                if (player.hasNextMediaItem()) player.seekToNextMediaItem()
            }
            else -> {
                player.pause()
                player.seekTo(0)
            }
        }
    }

    fun previous() {
        if (player.currentPosition > RESTART_THRESHOLD_MS || !player.hasPreviousMediaItem()) player.seekTo(0)
        else player.seekToPreviousMediaItem()
    }

    fun seekTo(positionMs: Long) {
        player.seekTo(positionMs.coerceAtLeast(0))
        _position.value = positionMs
    }

    fun jumpTo(index: Int) {
        if (index in 0 until player.mediaItemCount) {
            if (player.playbackState == Player.STATE_IDLE) player.prepare()
            player.seekTo(index, 0)
            player.play()
        }
    }

    fun toggleShuffle() {
        if (wave != null) return
        player.shuffleModeEnabled = !player.shuffleModeEnabled
    }

    fun cycleRepeat() {
        player.repeatMode = when (player.repeatMode) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
    }

    fun likeCurrent() {
        val track = _ui.value.track ?: return
        scope.launch { repo.toggleLike(track) }
    }

    /** "Not for me": tells Yandex, skips the track, and offers to take it back. */
    fun dislikeCurrent() {
        val track = _ui.value.track ?: return
        val played = player.currentPosition / 1000.0
        val client = repo.api
        if (client == null) {
            Toasts.say("Нет связи")
            return
        }
        scope.launch {
            try {
                client.setDislike(track.id, true)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                Toasts.say("Не удалось отметить «Не нравится»")
                return@launch
            }
            feedback(WaveEvent.Dislike, track, played)
            Toasts.say("Больше не покажем такое")
            // The dislike already told the radio everything a skip would, so skip quietly.
            lastTrack = null
            next()
        }
    }

    /* ---------- sleep timer ---------- */

    /** Stops the music after [minutes], fading it out over the last seconds. */
    fun startSleep(minutes: Int) {
        cancelSleep()
        val endsAt = SystemClock.elapsedRealtime() + minutes * 60_000L
        _sleep.value = Sleep.Timer(endsAt - SystemClock.elapsedRealtime())
        sleepJob = scope.launch {
            while (true) {
                val remaining = endsAt - SystemClock.elapsedRealtime()
                if (remaining <= 0) break
                val fading = remaining <= SLEEP_FADE_MS
                if (fading) player.volume = fadeLevel(SLEEP_FADE_MS - remaining, SLEEP_FADE_MS)
                _sleep.value = Sleep.Timer(remaining)
                delay(if (fading) 200 else 1000)
            }
            player.pause()
            player.volume = 1f
            _sleep.value = Sleep.Off
            Toasts.say("Таймер сна: музыка остановлена")
        }
    }

    /** Lets the current track play to its end and stops there. */
    fun sleepAfterTrack() {
        cancelSleep()
        player.pauseAtEndOfMediaItems = true
        _sleep.value = Sleep.AfterTrack
    }

    /** Turns the timer off; a fade that began is undone, so the music comes back at its volume. */
    fun cancelSleep() {
        sleepJob?.cancel()
        sleepJob = null
        player.volume = 1f
        player.pauseAtEndOfMediaItems = false
        _sleep.value = Sleep.Off
    }

    fun stop() {
        cancelSleep()
        wave = null
        lastTrack = null
        player.stop()
        player.clearMediaItems()
        heard.clear()
        memory.forget()
        _ui.value = PlayerUi(shuffle = player.shuffleModeEnabled, repeat = player.repeatMode)
        _position.value = 0
    }
}
