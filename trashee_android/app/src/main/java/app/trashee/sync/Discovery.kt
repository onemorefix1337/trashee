package app.trashee.sync

import android.content.Context
import android.net.ConnectivityManager
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

const val DISCOVERY_PORT = 47875
const val DISCOVER_MESSAGE = "TRASHEE-DISCOVER 1"

/** A computer with trashee that answered the call on the home network. */
data class Found(val id: String, val name: String, val host: String, val port: Int) {
    val address get() = "$host:$port"
}

/** Reads the answer of a computer; null for anything that is not one. */
fun parseDiscoveryReply(text: String, host: String): Found? = try {
    val reply: JsonObject = Json.parseToJsonElement(text).jsonObject
    if (reply["app"]?.jsonPrimitive?.content != "trashee") {
        null
    } else {
        Found(
            id = reply["id"]?.jsonPrimitive?.content.orEmpty(),
            name = reply["name"]?.jsonPrimitive?.content.orEmpty().ifEmpty { host },
            host = host,
            port = reply["port"]!!.jsonPrimitive.int,
        )
    }
} catch (_: Exception) {
    null
}

/** The broadcast address of each network the phone is on, next to the catch-all one. */
private fun broadcastAddresses(context: Context): List<InetAddress> {
    val found = mutableListOf(InetAddress.getByName("255.255.255.255"))
    val manager = context.getSystemService(ConnectivityManager::class.java) ?: return found
    val properties = manager.getLinkProperties(manager.activeNetwork) ?: return found
    for (link in properties.linkAddresses) {
        val address = link.address as? Inet4Address ?: continue
        val bits = link.prefixLength
        if (bits !in 1..30) continue
        val mask = -1 shl (32 - bits)
        val raw = address.address
        val value = raw.fold(0) { acc, byte -> (acc shl 8) or (byte.toInt() and 0xFF) }
        val broadcast = value or mask.inv()
        found += InetAddress.getByAddress(ByteArray(4) { (broadcast ushr (24 - 8 * it)).toByte() })
    }
    return found.distinct()
}

/** Asks the whole home network "who has trashee?" and collects the answers for a moment. */
suspend fun discoverComputers(context: Context, waitMs: Long = 1500): List<Found> = withContext(Dispatchers.IO) {
    val found = LinkedHashMap<String, Found>()
    try {
        DatagramSocket().use { socket ->
            socket.broadcast = true
            socket.soTimeout = 250
            val ask = DISCOVER_MESSAGE.toByteArray()
            for (target in broadcastAddresses(context)) {
                runCatching { socket.send(DatagramPacket(ask, ask.size, target, DISCOVERY_PORT)) }
            }
            val deadline = System.currentTimeMillis() + waitMs
            val buffer = ByteArray(2048)
            while (System.currentTimeMillis() < deadline) {
                val packet = DatagramPacket(buffer, buffer.size)
                try {
                    socket.receive(packet)
                } catch (_: java.net.SocketTimeoutException) {
                    continue
                }
                val host = packet.address.hostAddress ?: continue
                parseDiscoveryReply(String(packet.data, 0, packet.length), host)?.let { found[it.id.ifEmpty { host }] = it }
            }
        }
    } catch (_: Exception) {
        // No network, or the system refused: the phone can still be given the address by hand.
    }
    found.values.toList()
}
