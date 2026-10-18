@file:OptIn(UnstableApi::class)

package app.trashee.player

import android.net.Uri
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.TransferListener
import javax.crypto.Cipher

const val TRACK_SCHEME = "trashee"

/**
 * Plays "trashee://track/<id>": looks up the real link, opens it, and decrypts on the fly when Yandex
 * only hands out the encrypted stream. Anything else is passed straight through.
 */
class TrasheeDataSource(
    private val upstream: DataSource,
    private val infos: StreamInfos,
) : DataSource {
    private var cipher: Cipher? = null
    private var opened: Uri? = null

    override fun addTransferListener(transferListener: TransferListener) = upstream.addTransferListener(transferListener)

    override fun open(dataSpec: DataSpec): Long {
        cipher = null
        opened = dataSpec.uri
        if (dataSpec.uri.scheme != TRACK_SCHEME) return upstream.open(dataSpec)

        val trackId = dataSpec.uri.lastPathSegment ?: throw java.io.IOException("Нет номера трека")
        var info = infos.info(trackId)
        val length = try {
            upstream.open(dataSpec.buildUpon().setUri(Uri.parse(info.url)).build())
        } catch (error: HttpDataSource.InvalidResponseCodeException) {
            // The link has probably expired; ask for a fresh one once.
            infos.forget(trackId)
            info = infos.info(trackId)
            upstream.open(dataSpec.buildUpon().setUri(Uri.parse(info.url)).build())
        }
        if (info.transport == "encraw" && info.key != null) cipher = aesCtrCipher(info.key, dataSpec.position)
        return length
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        val count = upstream.read(buffer, offset, length)
        if (count > 0) cipher?.update(buffer, offset, count, buffer, offset)
        return count
    }

    override fun getUri(): Uri? = opened

    override fun getResponseHeaders(): Map<String, List<String>> = upstream.responseHeaders

    override fun close() {
        cipher = null
        opened = null
        upstream.close()
    }
}
