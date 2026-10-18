package app.trashee.api

import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

// Constants of the official Yandex Music apps; the API is private, so third-party clients reuse them.
const val ANDROID_CLIENT = "YandexMusicAndroid/24023621"
const val DESKTOP_CLIENT = "YandexMusicDesktopAppWindows/5.95.0"
private const val DESKTOP_SIGN_KEY = "kzqU4XhfCaY6B6JTHODeq5"
private const val ANDROID_SIGN_KEY = "p93jhgh689SBReK6ghtw62"

data class Signed(val ts: Long, val sign: String)

private fun hmacBase64(key: String, message: String): String {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(key.toByteArray(), "HmacSHA256"))
    return Base64.getEncoder().encodeToString(mac.doFinal(message.toByteArray()))
}

/** Signature of /get-file-info. It is checked together with the X-Yandex-Music-Client header. */
fun fileInfoSign(
    trackId: String,
    quality: String,
    codecs: List<String>,
    transport: String,
    ts: Long = System.currentTimeMillis() / 1000,
): Signed {
    val message = "$ts$trackId$quality${codecs.joinToString("")}$transport"
    // The server expects the base64 value without its trailing padding character.
    return Signed(ts, hmacBase64(DESKTOP_SIGN_KEY, message).dropLast(1))
}

/** Signature of /tracks/{id}/lyrics; unlike get-file-info it uses the Android key and keeps the padding. */
fun lyricsSign(trackId: String, ts: Long = System.currentTimeMillis() / 1000): Signed {
    val numericId = trackId.substringBefore(':')
    return Signed(ts, hmacBase64(ANDROID_SIGN_KEY, "$numericId$ts"))
}
