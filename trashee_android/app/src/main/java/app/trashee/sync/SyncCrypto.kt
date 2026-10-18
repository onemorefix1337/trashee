package app.trashee.sync

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/*
 * What the phone and the computer prove to each other on the home network; the desktop app has the same
 * functions in src/main/sync/crypto.ts and both are checked against the same reference values.
 *
 * Pairing: the computer shows a short code. The phone sends HMAC(code, "pair|deviceId|nonce") instead of the code,
 * and gets the long-term token back XORed with HMAC(code, "tok|nonce"), so the code itself never travels.
 * After that every request is signed with the token: the token itself never travels either.
 */

private fun hmac(key: String, data: String): ByteArray =
    Mac.getInstance("HmacSHA256").run {
        init(SecretKeySpec(key.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        doFinal(data.toByteArray(Charsets.UTF_8))
    }

private fun ByteArray.hex(): String = joinToString("") { "%02x".format(it) }

private fun String.unhex(): ByteArray = ByteArray(length / 2) { substring(it * 2, it * 2 + 2).toInt(16).toByte() }

fun sha256Hex(data: String): String = MessageDigest.getInstance("SHA-256").digest(data.toByteArray(Charsets.UTF_8)).hex()

fun randomHex(bytes: Int): String = ByteArray(bytes).also { SecureRandom().nextBytes(it) }.hex()

fun pairProof(code: String, deviceId: String, nonce: String): String = hmac(code, "pair|$deviceId|$nonce").hex()

/** XOR is its own inverse: the computer wraps the token with this key, the phone unwraps it with the same one. */
fun unwrapToken(wrappedHex: String, code: String, nonce: String): String {
    val key = hmac(code, "tok|$nonce")
    val wrapped = wrappedHex.unhex()
    return ByteArray(wrapped.size) { (wrapped[it].toInt() xor key[it % key.size].toInt()).toByte() }.hex()
}

fun requestSignature(token: String, method: String, path: String, time: Long, nonce: String, body: String): String =
    hmac(token, "$method\n$path\n$time\n$nonce\n${sha256Hex(body)}").hex()
