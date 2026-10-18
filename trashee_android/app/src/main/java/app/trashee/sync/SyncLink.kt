package app.trashee.sync

import app.trashee.api.sharedHttp
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.longOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

private const val FIRST_RETRY_MS = 1_000L
private const val LAST_RETRY_MS = 30_000L
/** The computer sends a ping every 20 seconds; silence for three times that means the connection is dead. */
private const val SILENCE_MS = 60L

sealed interface LinkState {
    data object Off : LinkState
    data object Connecting : LinkState
    data class Online(val serverName: String) : LinkState
    data class Retrying(val reason: String) : LinkState
    /** The computer no longer knows this phone (it was removed there); pairing has to be done again. */
    data object Forgotten : LinkState
}

private val JSON_TYPE = "application/json".toMediaType()

/**
 * The phone's end of the link to the computer: one event stream kept open (with retries) and signed requests for
 * everything else. It knows nothing about the player; [SyncController] connects the two.
 */
class SyncLink(
    private val scope: CoroutineScope,
    /** Finds the computer again by its id when the address it was paired at stops answering. */
    private val relocate: suspend (serverId: String) -> String?,
    private val http: OkHttpClient = sharedHttp,
) {
    private val _state = MutableStateFlow<LinkState>(LinkState.Off)
    val state: StateFlow<LinkState> = _state.asStateFlow()
    private val _host = MutableStateFlow<NowPlaying?>(null)
    /** What the computer is playing. */
    val host: StateFlow<NowPlaying?> = _host.asStateFlow()
    private val _peers = MutableStateFlow<List<DeviceStatus>>(emptyList())
    /** The other phones paired with the same computer. */
    val peers: StateFlow<List<DeviceStatus>> = _peers.asStateFlow()

    /** Computer clock minus phone clock, from the greeting of the stream. */
    @Volatile var clockOffsetMs = 0L
        private set

    var onCommand: (DeviceRef, SyncCommand) -> Unit = { _, _ -> }
    var onHandoff: (Handoff) -> Unit = {}
    var onPull: (DeviceRef) -> Unit = {}
    /** The computer was found at a new address. */
    var onRelocated: (Pairing) -> Unit = {}

    @Volatile private var pairing: Pairing? = null
    private var job: Job? = null
    private val streamHttp = http.newBuilder().readTimeout(SILENCE_MS, TimeUnit.SECONDS).build()

    fun connect(target: Pairing) {
        disconnect()
        pairing = target
        job = scope.launch(Dispatchers.IO) { run(target) }
    }

    fun disconnect() {
        job?.cancel()
        job = null
        pairing = null
        _state.value = LinkState.Off
        _host.value = null
        _peers.value = emptyList()
    }

    private fun signed(target: Pairing, method: String, path: String, body: String, client: OkHttpClient = http): Request {
        val time = System.currentTimeMillis()
        val nonce = randomHex(8)
        val builder = Request.Builder().url("http://${target.address}$path")
            .header("x-device", target.deviceId)
            .header("x-time", time.toString())
            .header("x-nonce", nonce)
            .header("x-sig", requestSignature(target.token, method, path, time, nonce, body))
        return if (method == "POST") builder.post(body.toRequestBody(JSON_TYPE)).build() else builder.get().build()
    }

    private suspend fun run(initial: Pairing) {
        var current = initial
        var delayMs = FIRST_RETRY_MS
        var failures = 0
        while (currentCoroutineContext().isActive) {
            _state.value = LinkState.Connecting
            try {
                val greeted = stream(current)
                if (greeted) { delayMs = FIRST_RETRY_MS; failures = 0 }
                _state.value = LinkState.Retrying("connection closed")
            } catch (error: CancellationException) {
                throw error
            } catch (error: Forgotten) {
                _state.value = LinkState.Forgotten
                pairing = null
                return
            } catch (error: Exception) {
                failures += 1
                _state.value = LinkState.Retrying(error.message.orEmpty())
            }
            _host.value = null
            _peers.value = emptyList()
            // The router may have given the computer another address while the phone was away.
            if (failures >= 2) {
                relocate(current.serverId)?.takeIf { it != current.address }?.let { address ->
                    current = current.copy(address = address)
                    pairing = current
                    onRelocated(current)
                    failures = 0
                }
            }
            delay(delayMs)
            delayMs = minOf(delayMs * 2, LAST_RETRY_MS)
        }
    }

    private class Forgotten : Exception()

    /** Reads the event stream until it ends; true when the computer greeted us, so the connection did work. */
    private suspend fun stream(target: Pairing): Boolean {
        val call = streamHttp.newCall(signed(target, "GET", "/events", "", streamHttp))
        val cancelWithScope = currentCoroutineContext()[Job]?.invokeOnCompletion { call.cancel() }
        try {
            call.execute().use { response ->
                if (response.code == 401) throw Forgotten()
                if (!response.isSuccessful) error("HTTP ${response.code}")
                val source = response.body.source()
                var event = ""
                var data = StringBuilder()
                var greeted = false
                while (true) {
                    val line = source.readUtf8Line() ?: break
                    when {
                        line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                        line.startsWith("data:") -> data.append(line.removePrefix("data:").trim())
                        line.isEmpty() && event.isNotEmpty() -> {
                            if (event == "hello") greeted = true
                            handle(event, data.toString(), target)
                            event = ""
                            data = StringBuilder()
                        }
                    }
                }
                return greeted
            }
        } finally {
            cancelWithScope?.dispose()
        }
    }

    private fun handle(event: String, data: String, target: Pairing) {
        try {
            when (event) {
                "hello" -> {
                    val now = Json.parseToJsonElement(data).jsonObject["now"]?.jsonPrimitive?.longOrNull
                    if (now != null) clockOffsetMs = now - System.currentTimeMillis()
                    val name = Json.parseToJsonElement(data).jsonObject["serverName"]?.jsonPrimitive?.contentOrNull
                    _state.value = LinkState.Online(name ?: target.serverName)
                }
                "host" -> _host.value = if (data == "null") null else syncJson.decodeFromString<NowPlaying>(data)
                "devices" -> _peers.value = syncJson.decodeFromString<List<DeviceStatus>>(data)
                "command" -> {
                    val obj: JsonObject = Json.parseToJsonElement(data).jsonObject
                    val from = syncJson.decodeFromString<DeviceRef>(obj["from"].toString())
                    onCommand(from, syncJson.decodeFromString<SyncCommand>(data))
                }
                "handoff" -> onHandoff(syncJson.decodeFromString<Handoff>(data))
                "pull" -> {
                    val from = Json.parseToJsonElement(data).jsonObject["from"]
                    if (from != null) onPull(syncJson.decodeFromString<DeviceRef>(from.toString()))
                }
            }
        } catch (_: Exception) {
            // A message that does not make sense is skipped; the stream goes on.
        }
    }

    /** A signed POST to the computer; false when it could not be delivered. */
    suspend fun post(path: String, body: JsonObject): Boolean {
        val target = pairing ?: return false
        return withContext(Dispatchers.IO) {
            try {
                http.newCall(signed(target, "POST", path, body.toString())).execute().use { it.isSuccessful }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                false
            }
        }
    }

    suspend fun postState(state: NowPlaying): Boolean =
        post("/state", Json.parseToJsonElement(syncJson.encodeToString(state)).jsonObject)

    suspend fun command(target: String, command: SyncCommand): Boolean = post(
        "/command",
        buildJsonObject {
            put("target", target)
            put("command", Json.parseToJsonElement(syncJson.encodeToString(command)))
        },
    )

    suspend fun handoff(target: String, handoff: Handoff): Boolean = post(
        "/handoff",
        buildJsonObject {
            put("target", target)
            put("handoff", Json.parseToJsonElement(syncJson.encodeToString(handoff)))
        },
    )

    suspend fun pull(target: String): Boolean = post("/pull", buildJsonObject { put("target", target) })
}

/** What pairing can say to the user when it fails. */
class PairingError(message: String) : Exception(message)

/** Pairs with the computer at [address] using the code it shows; the code itself never leaves the phone. */
suspend fun pairWithComputer(
    address: String,
    code: String,
    deviceId: String,
    deviceName: String,
    http: OkHttpClient = sharedHttp,
): Pairing = withContext(Dispatchers.IO) {
    val nonce = randomHex(8)
    val body = buildJsonObject {
        put("deviceId", deviceId)
        put("name", deviceName)
        put("platform", "android")
        put("nonce", nonce)
        put("proof", pairProof(code, deviceId, nonce))
    }.toString()
    val request = Request.Builder().url("http://$address/pair").post(body.toRequestBody(JSON_TYPE)).build()
    val response = try {
        http.newCall(request).execute()
    } catch (_: Exception) {
        throw PairingError("Не удалось связаться с компьютером. Проверь адрес и что оба устройства в одной сети.")
    }
    response.use {
        when {
            it.code == 403 -> throw PairingError("Неверный код или он устарел. Покажи новый на компьютере.")
            !it.isSuccessful -> throw PairingError("Компьютер ответил ошибкой ${it.code}.")
        }
        val reply = Json.parseToJsonElement(it.body.string()).jsonObject
        Pairing(
            serverId = reply["serverId"]!!.jsonPrimitive.content,
            serverName = reply["serverName"]?.jsonPrimitive?.content ?: address,
            address = address,
            token = unwrapToken(reply["token"]!!.jsonPrimitive.content, code, nonce),
            deviceId = deviceId,
        )
    }
}
