package app.trashee.api

import app.trashee.BuildConfig
import app.trashee.data.DeviceCode
import app.trashee.data.get
import app.trashee.data.int
import app.trashee.data.str
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.FormBody
import okhttp3.Request

// Public OAuth credentials of the official Android app (the device flow needs no user password in our app).
private const val CLIENT_ID = "23cabbbdc6cd418abb4b39c32c41195d"
private const val CLIENT_SECRET = "53bc75238f0c4d08a118e51fe9203300"

/** The server answered and said the login cannot succeed (expired code, access denied, ...). */
class OAuthError(message: String) : Exception(message)

private val json = Json { ignoreUnknownKeys = true; isLenient = true }

private fun randomDeviceId(): String {
    val alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    return (1..10).map { alphabet.random() }.joinToString("")
}

private suspend fun post(path: String, form: Map<String, String>): Pair<Int, kotlinx.serialization.json.JsonElement?> =
    withContext(Dispatchers.IO) {
        val body = FormBody.Builder().apply { form.forEach { (k, v) -> add(k, v) } }.build()
        val request = Request.Builder().url(BuildConfig.OAUTH_BASE + path).post(body).build()
        sharedHttp.newCall(request).execute().use { response ->
            response.code to runCatching { json.parseToJsonElement(response.body.string()) }.getOrNull()
        }
    }

suspend fun requestDeviceCode(): DeviceCode {
    val (status, body) = post(
        "/device/code",
        mapOf("client_id" to CLIENT_ID, "device_id" to randomDeviceId(), "device_name" to "trashee"),
    )
    val deviceCode = body["device_code"].str()
    if (status !in 200..299 || deviceCode == null) throw OAuthError("Не удалось получить код входа ($status)")
    return DeviceCode(
        deviceCode = deviceCode,
        userCode = body["user_code"].str().orEmpty(),
        verificationUrl = body["verification_url"].str().orEmpty(),
        intervalSec = body["interval"].int() ?: 5,
        expiresInSec = body["expires_in"].int() ?: 300,
    )
}

/**
 * Returns the access token, or null while the user has not confirmed the code yet.
 * Throws [OAuthError] when the login cannot succeed, and a plain exception on network trouble (worth retrying).
 */
suspend fun pollDeviceToken(deviceCode: String): String? {
    val (status, body) = post(
        "/token",
        mapOf("grant_type" to "device_code", "code" to deviceCode, "client_id" to CLIENT_ID, "client_secret" to CLIENT_SECRET),
    )
    body["access_token"].str()?.takeIf { status in 200..299 }?.let { return it }
    val error = body["error"].str()
    if (error == "authorization_pending" || error == "slow_down") return null
    throw OAuthError(body["error_description"].str() ?: error ?: "Ошибка входа ($status)")
}
