package app.trashee.api

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import java.io.IOException
import java.net.InetAddress
import java.net.Socket
import javax.net.SocketFactory
import okhttp3.Dns

object DirectNetwork {
    @Volatile
    private var appContext: Context? = null

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun isYandexHost(host: String?): Boolean {
        if (host == null) return false
        val h = host.lowercase()
        return h.endsWith(".yandex.net") ||
                h.endsWith(".yandex.ru") ||
                h.endsWith(".yandex.com") ||
                h.endsWith(".yandex.by") ||
                h.endsWith(".yandex.kz") ||
                h.endsWith(".yandex.uz") ||
                h == "yandex.ru" ||
                h == "yandex.net" ||
                h == "ya.ru" ||
                h == "ya.cc"
    }

    /** Returns the underlying physical non-VPN network (Wi-Fi, Cellular) if a VPN is currently active, or null. */
    @Suppress("DEPRECATION")
    fun getPhysicalNetwork(): Network? {
        val context = appContext ?: return null
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return null
        val active = cm.activeNetwork ?: return null
        val activeCaps = cm.getNetworkCapabilities(active) ?: return null

        // If the active network is not a VPN, the default route is already physical/direct.
        if (!activeCaps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
            return null
        }

        // Active network is a VPN. Find the underlying physical network with internet access.
        val all = cm.allNetworks
        // First check for Wi-Fi or Ethernet
        for (net in all) {
            val caps = cm.getNetworkCapabilities(net) ?: continue
            if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN) &&
                (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                 caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))
            ) {
                return net
            }
        }
        // Then check for Cellular
        for (net in all) {
            val caps = cm.getNetworkCapabilities(net) ?: continue
            if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN) &&
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
            ) {
                return net
            }
        }
        return null
    }
}

/** SocketFactory that binds created sockets to the physical network to bypass VPN when one is active. */
class DirectSocketFactory : SocketFactory() {
    override fun createSocket(): Socket {
        val net = DirectNetwork.getPhysicalNetwork()
        if (net != null) {
            try {
                val s = net.socketFactory.createSocket()
                try {
                    net.bindSocket(s)
                } catch (_: Exception) {}
                return s
            } catch (_: Exception) {}
        }
        return SocketFactory.getDefault().createSocket()
    }

    override fun createSocket(host: String?, port: Int): Socket {
        val net = DirectNetwork.getPhysicalNetwork()
        if (net != null) {
            try {
                return net.socketFactory.createSocket(host, port)
            } catch (_: Exception) {}
        }
        return SocketFactory.getDefault().createSocket(host, port)
    }

    override fun createSocket(host: String?, port: Int, localHost: InetAddress?, localPort: Int): Socket {
        val net = DirectNetwork.getPhysicalNetwork()
        if (net != null) {
            try {
                return net.socketFactory.createSocket(host, port, localHost, localPort)
            } catch (_: Exception) {}
        }
        return SocketFactory.getDefault().createSocket(host, port, localHost, localPort)
    }

    override fun createSocket(host: InetAddress?, port: Int): Socket {
        val net = DirectNetwork.getPhysicalNetwork()
        if (net != null) {
            try {
                return net.socketFactory.createSocket(host, port)
            } catch (_: Exception) {}
        }
        return SocketFactory.getDefault().createSocket(host, port)
    }

    override fun createSocket(address: InetAddress?, port: Int, localAddress: InetAddress?, localPort: Int): Socket {
        val net = DirectNetwork.getPhysicalNetwork()
        if (net != null) {
            try {
                return net.socketFactory.createSocket(address, port, localAddress, localPort)
            } catch (_: Exception) {}
        }
        return SocketFactory.getDefault().createSocket(address, port, localAddress, localPort)
    }
}

/** DNS resolver that uses the physical network directly when VPN is active. */
val directDns = Dns { hostname ->
    val net = DirectNetwork.getPhysicalNetwork()
    if (net != null) {
        try {
            val addresses = net.getAllByName(hostname).toList()
            if (addresses.isNotEmpty()) return@Dns addresses
        } catch (_: Exception) {}
    }
    Dns.SYSTEM.lookup(hostname)
}
