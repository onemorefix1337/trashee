package app.trashee.data

import android.content.Context
import app.trashee.api.OAuthError
import app.trashee.api.YandexClient
import app.trashee.api.isAuthFailure
import app.trashee.api.pollDeviceToken
import app.trashee.api.requestDeviceCode
import app.trashee.lyrics.OPEN_SOURCES
import app.trashee.lyrics.resolveLyrics
import app.trashee.player.sanitizeEqGains
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface Session {
    data object Restoring : Session
    data object Offline : Session
    /** [code] is null until the server hands one out; [error] says why the last try failed. */
    data class LoggedOut(val code: DeviceCode? = null, val error: String? = null, val busy: Boolean = false) : Session
    data class Ready(val account: Account) : Session
}

private const val RESTORE_ATTEMPTS = 3
private const val RESTORE_RETRY_MS = 2000L

private const val RECONNECT_MS = 30_000L

const val VISUALIZER_SHIFT_MIN_MS = -200
const val VISUALIZER_SHIFT_MAX_MS = 600

/** Login state, the API client, the user's likes and settings: everything the screens share. */
class Repo(context: Context, private val scope: CoroutineScope) {
    /** The collections saved for offline listening; set once the app has built them. */
    @Volatile var offline: OfflineLibrary? = null
    private val tokens = TokenStore(context)
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    @Volatile var api: YandexClient? = null
        private set

    private val _session = MutableStateFlow<Session>(Session.Restoring)
    val session: StateFlow<Session> = _session.asStateFlow()

    private val _quality = MutableStateFlow(
        Quality.entries.firstOrNull { it.wire == prefs.getString("quality", null) } ?: Quality.Hq,
    )
    val quality: StateFlow<Quality> = _quality.asStateFlow()

    private val _prefetchNext = MutableStateFlow(prefs.getBoolean("prefetchNext", true))
    /** Download the next track while the current one is still playing. */
    val prefetchNext: StateFlow<Boolean> = _prefetchNext.asStateFlow()

    private val _eqGains = MutableStateFlow(
        sanitizeEqGains(prefs.getString("eqGains", null)?.split(',')?.map { it.toFloatOrNull() ?: Float.NaN }),
    )
    /** One gain in dB for each of the ten equalizer bands. */
    val eqGains: StateFlow<List<Float>> = _eqGains.asStateFlow()

    private val _visualizerShiftMs = MutableStateFlow(prefs.getInt("visualizerShiftMs", 0).coerceIn(VISUALIZER_SHIFT_MIN_MS, VISUALIZER_SHIFT_MAX_MS))
    /** How much later (or, below zero, earlier) the bars move than the player's own estimate of when the sound is heard. */
    val visualizerShiftMs: StateFlow<Int> = _visualizerShiftMs.asStateFlow()

    private val _offlineMode = MutableStateFlow(false)
    /** Signed in, but Yandex cannot be reached: only what was saved for offline listening works. */
    val offlineMode: StateFlow<Boolean> = _offlineMode.asStateFlow()

    private var reconnectJob: Job? = null

    private val _likedIds = MutableStateFlow<Set<String>>(emptySet())
    val likedIds: StateFlow<Set<String>> = _likedIds.asStateFlow()

    /** The library is loaded once per login and refreshed when asked; null means "not loaded yet". */
    private val _liked = MutableStateFlow<List<Track>?>(null)
    val liked: StateFlow<List<Track>?> = _liked.asStateFlow()
    private val _playlists = MutableStateFlow<List<PlaylistInfo>?>(null)
    val playlists: StateFlow<List<PlaylistInfo>?> = _playlists.asStateFlow()
    private val _pins = MutableStateFlow<List<Pin>?>(null)
    val pins: StateFlow<List<Pin>?> = _pins.asStateFlow()
    private val _libraryFailed = MutableStateFlow(false)
    val libraryFailed: StateFlow<Boolean> = _libraryFailed.asStateFlow()

    private var loginJob: Job? = null
    private val lyricsCache = LinkedHashMap<String, Lyrics>()

    fun setQuality(value: Quality) {
        _quality.value = value
        prefs.edit().putString("quality", value.wire).apply()
    }

    fun setEqGains(value: List<Float>) {
        val gains = sanitizeEqGains(value)
        _eqGains.value = gains
        prefs.edit().putString("eqGains", gains.joinToString(",")).apply()
    }

    fun setVisualizerShift(value: Int) {
        val shift = value.coerceIn(VISUALIZER_SHIFT_MIN_MS, VISUALIZER_SHIFT_MAX_MS)
        _visualizerShiftMs.value = shift
        prefs.edit().putInt("visualizerShiftMs", shift).apply()
    }

    fun setPrefetchNext(value: Boolean) {
        _prefetchNext.value = value
        prefs.edit().putBoolean("prefetchNext", value).apply()
    }

    private suspend fun signIn(token: String): Account {
        val candidate = YandexClient(token)
        val account = candidate.account()
        api = candidate
        return account
    }

    fun restore() {
        scope.launch {
            val token = tokens.load()
            if (token == null) {
                _session.value = Session.LoggedOut()
                return@launch
            }
            _session.value = Session.Restoring
            // With something saved there is a reason to open the app without a connection, so do not make the user wait.
            val attempts = if (offline?.isEmpty() == false) 1 else RESTORE_ATTEMPTS
            for (attempt in 1..attempts) {
                try {
                    val account = signIn(token)
                    onReady(account)
                    return@launch
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    // Only a rejected token is forgotten; a flaky network must not log the user out.
                    if (error.isAuthFailure()) {
                        tokens.clear()
                        _session.value = Session.LoggedOut()
                        return@launch
                    }
                    if (attempt == attempts) {
                        if (offline?.isEmpty() == false) startOffline(token) else _session.value = Session.Offline
                        return@launch
                    }
                    delay(RESTORE_RETRY_MS)
                }
            }
        }
    }

    /** Opens the app with what was saved, and keeps looking for the connection in the background. */
    private fun startOffline(token: String) {
        _offlineMode.value = true
        _session.value = Session.Ready(Account(0, "Без сети", false))
        _liked.value = offline?.get("liked")?.tracks
        _playlists.value = savedAsPlaylists()
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            while (_offlineMode.value) {
                delay(RECONNECT_MS)
                try {
                    val account = signIn(token)
                    _offlineMode.value = false
                    onReady(account)
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    if (error.isAuthFailure()) {
                        tokens.clear()
                        _offlineMode.value = false
                        _session.value = Session.LoggedOut()
                    }
                }
            }
        }
    }

    private fun savedAsPlaylists(): List<PlaylistInfo> = offline?.saved?.value.orEmpty().mapNotNull { entry ->
        val ref = entry.ref?.toRef() ?: return@mapNotNull null
        PlaylistInfo(ref, entry.key, entry.title, entry.subtitle, false, entry.coverUri, entry.trackCount)
    }

    private fun onReady(account: Account) {
        _session.value = Session.Ready(account)
        scope.launch { loadLikedIds() }
        refreshLibrary()
    }

    fun refreshLibrary() {
        val client = api ?: return
        _libraryFailed.value = false
        scope.launch {
            try {
                _liked.value = client.likedTracks()
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                // Offline: the saved copy of the liked tracks, if there is one.
                val saved = offline?.get("liked")?.tracks
                if (saved != null) _liked.value = saved else _libraryFailed.value = true
            }
        }
        scope.launch {
            runCatching { client.playlists() }
                .onSuccess { _playlists.value = it }
                .onFailure { if (_playlists.value == null) _playlists.value = savedAsPlaylists().ifEmpty { null } }
        }
        scope.launch { runCatching { client.pins() }.onSuccess { _pins.value = it } }
    }

    fun startLogin() {
        loginJob?.cancel()
        loginJob = scope.launch {
            _session.value = Session.LoggedOut(busy = true)
            try {
                val code = requestDeviceCode()
                _session.value = Session.LoggedOut(code = code)
                val deadline = System.currentTimeMillis() + code.expiresInSec * 1000L
                while (System.currentTimeMillis() < deadline) {
                    delay(code.intervalSec * 1000L)
                    val token = try {
                        pollDeviceToken(code.deviceCode)
                    } catch (error: OAuthError) {
                        throw error
                    } catch (error: CancellationException) {
                        throw error
                    } catch (_: Exception) {
                        null // network trouble counts as "not confirmed yet"
                    }
                    if (token != null) {
                        // Saved before the first API call, so a network hiccup right now does not cost another code.
                        runCatching { tokens.save(token) }
                        onReady(signIn(token))
                        return@launch
                    }
                }
                _session.value = Session.LoggedOut(error = "Время подтверждения истекло")
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _session.value = Session.LoggedOut(error = error.message ?: "Не удалось войти")
            }
        }
    }

    fun cancelLogin() {
        loginJob?.cancel()
        _session.value = Session.LoggedOut()
    }

    fun logout() {
        loginJob?.cancel()
        reconnectJob?.cancel()
        _offlineMode.value = false
        api = null
        tokens.clear()
        _likedIds.value = emptySet()
        _liked.value = null
        _playlists.value = null
        _pins.value = null
        _session.value = Session.LoggedOut()
    }

    suspend fun loadLikedIds() {
        runCatching { api?.likedIds() }.getOrNull()?.let { _likedIds.value = it.toSet() }
    }

    /** Flips the like locally right away and tells Yandex; puts it back when that fails. */
    suspend fun toggleLike(track: Track): Boolean {
        val liked = track.id !in _likedIds.value
        fun apply(value: Boolean) {
            _likedIds.value = if (value) _likedIds.value + track.id else _likedIds.value - track.id
        }
        val client = api
        if (client == null) {
            Toasts.say("Нет связи: лайк не отправлен")
            return false
        }
        apply(liked)
        return try {
            client.setLike(track.id, liked)
            true
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            apply(!liked)
            false
        }
    }

    /** The page of a collection; when Yandex cannot be reached, the copy saved for offline listening. */
    suspend fun collection(ref: CollectionRef): Collection = try {
        (api ?: error("Нет связи")).collection(ref)
    } catch (error: CancellationException) {
        throw error
    } catch (error: Exception) {
        if (error.isAuthFailure()) throw error
        offline?.get(ref.key())?.toCollection(ref) ?: throw error
    }

    suspend fun lyrics(track: Track): Lyrics {
        lyricsCache[track.id]?.let { return it }
        // A saved collection brought its lyrics along, so they work without a connection.
        offline?.lyricsOf(track.id)?.takeIf { it.source != null || it.instrumental }?.let { return it }
        val query = LyricsQuery(
            id = track.id,
            title = track.title,
            artists = track.artists.map { it.name },
            album = track.albums.firstOrNull()?.title,
            durationSec = track.durationMs / 1000.0,
        )
        val client = api ?: error("Не выполнен вход")
        val found = resolveLyrics(query, { client.lyrics(track.id) }, OPEN_SOURCES)
        synchronized(lyricsCache) {
            lyricsCache[track.id] = found
            if (lyricsCache.size > 60) lyricsCache.remove(lyricsCache.keys.first())
        }
        return found
    }
}
