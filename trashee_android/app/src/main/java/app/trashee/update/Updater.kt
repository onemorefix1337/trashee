package app.trashee.update

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.trashee.BuildConfig
import app.trashee.api.sharedHttp
import app.trashee.data.bool
import app.trashee.data.get
import app.trashee.data.list
import app.trashee.data.long
import app.trashee.data.str
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.Request

enum class UpdateStatus { Idle, Checking, None, Available, Downloading, NeedPermission, Installing, Error }

data class UpdateInfo(
    val version: String,
    val notes: String,
    val publishedAt: String,
    val pageUrl: String,
    val apk: ReleaseAsset,
    val sumsUrl: String?,
)

data class UpdateState(
    val status: UpdateStatus = UpdateStatus.Idle,
    /** Whether the dialog should be on screen. */
    val prompt: Boolean = false,
    val info: UpdateInfo? = null,
    val received: Long = 0,
    val total: Long = 0,
    val error: String? = null,
    /** Check on every start. */
    val auto: Boolean = true,
    val checkedAt: Long? = null,
)

/** Whether the update dialog is on screen in this state. */
fun UpdateState.showsDialog(): Boolean =
    prompt && info != null && status in setOf(UpdateStatus.Available, UpdateStatus.Downloading, UpdateStatus.NeedPermission, UpdateStatus.Installing, UpdateStatus.Error)

private const val STARTUP_DELAY_MS = 4_000L
private const val RECHECK_MS = 6L * 60 * 60 * 1000
private const val PROGRESS_STEP_BYTES = 64L * 1024
private val json = Json { ignoreUnknownKeys = true; isLenient = true }

/**
 * Looks for a newer Android release on GitHub, downloads it, checks it against the published checksums and
 * hands it to the system installer, which asks the user to confirm (Android does not let an app install silently).
 */
class Updater(private val context: Context, private val scope: CoroutineScope) {
    private val prefs = context.getSharedPreferences("updates", Context.MODE_PRIVATE)
    private var settings = UpdatePrefs(
        auto = prefs.getBoolean("auto", true),
        skipped = prefs.getString("skipped", null),
        remindAfter = prefs.getLong("remindAfter", 0),
    )
    private val _state = MutableStateFlow(UpdateState(auto = settings.auto))
    val state: StateFlow<UpdateState> = _state.asStateFlow()

    private var work: Job? = null

    private fun save() {
        prefs.edit().putBoolean("auto", settings.auto).putString("skipped", settings.skipped).putLong("remindAfter", settings.remindAfter).apply()
    }

    /** One look shortly after the start, then every few hours while the app stays alive. */
    fun startBackgroundChecks() {
        scope.launch {
            delay(STARTUP_DELAY_MS)
            while (isActive) {
                if (settings.auto) check(manual = false)
                delay(RECHECK_MS)
            }
        }
    }

    /** Installers come from GitHub; only a test server set at build time may be anywhere else. */
    private fun trusted(url: String): Boolean {
        if (BuildConfig.GITHUB_API != DEFAULT_API) return url.startsWith("http://") || url.startsWith("https://")
        val uri = Uri.parse(url)
        val host = uri.host ?: return false
        return uri.scheme == "https" && (host == "github.com" || host.endsWith(".githubusercontent.com"))
    }

    /** Looks for a newer release. A manual check always shows its result; a background one stays quiet. */
    fun check(manual: Boolean) {
        val current = _state.value
        if (current.status in setOf(UpdateStatus.Checking, UpdateStatus.Downloading, UpdateStatus.Installing)) {
            if (manual && current.info != null) _state.update { it.copy(prompt = true) }
            return
        }
        val before = current.status
        _state.update { it.copy(status = UpdateStatus.Checking, error = null) }
        scope.launch {
            try {
                val releases = withContext(Dispatchers.IO) { fetchReleases() }
                val checkedAt = System.currentTimeMillis()
                val newest = releases
                    .mapNotNull { release -> androidVersionOfTag(release["tag_name"].str().orEmpty())?.let { it to release } }
                    .filter { (_, release) -> release["draft"].bool() != true && release["prerelease"].bool() != true }
                    // A desktop-only release (no APK in it) is not an update for the phone, however new its number.
                    .filter { (_, release) -> pickApk(releaseAssets(release)) != null }
                    .maxWithOrNull { (a, _), (b, _) -> compareVersions(a, b) ?: 0 }

                if (newest == null || !isNewer(newest.first, BuildConfig.VERSION_NAME)) {
                    _state.update { it.copy(status = UpdateStatus.None, info = null, prompt = false, checkedAt = checkedAt) }
                    return@launch
                }
                val (version, release) = newest
                val assets = releaseAssets(release)
                val apk = pickApk(assets)?.takeIf { trusted(it.url) }
                if (apk == null) {
                    _state.update { it.copy(status = UpdateStatus.None, info = null, prompt = false, checkedAt = checkedAt) }
                    return@launch
                }
                val info = UpdateInfo(
                    version = version,
                    notes = plainNotes(release["body"].str().orEmpty()),
                    publishedAt = release["published_at"].str().orEmpty(),
                    pageUrl = release["html_url"].str()?.takeIf(::trusted) ?: "https://github.com/${BuildConfig.REPO}/releases",
                    apk = apk,
                    sumsUrl = assets.firstOrNull { it.name == "SHA256SUMS.txt" }?.url?.takeIf(::trusted),
                )
                _state.update {
                    it.copy(
                        status = UpdateStatus.Available,
                        info = info,
                        prompt = manual || (settings.auto && shouldPrompt(version, settings, System.currentTimeMillis())),
                        received = 0, total = 0, error = null, checkedAt = checkedAt,
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (manual) {
                    _state.update { it.copy(status = UpdateStatus.Error, error = "Нет связи с GitHub", info = null, prompt = false) }
                } else {
                    _state.update { it.copy(status = if (before == UpdateStatus.Error) UpdateStatus.Idle else before) }
                }
            }
        }
    }

    private fun releaseAssets(release: kotlinx.serialization.json.JsonElement?): List<ReleaseAsset> =
        release["assets"].list().map {
            ReleaseAsset(it["name"].str().orEmpty(), it["size"].long() ?: 0, it["browser_download_url"].str().orEmpty())
        }

    private fun fetchReleases() = http("${BuildConfig.GITHUB_API}/releases?per_page=30").use { response ->
        if (!response.isSuccessful) error("GitHub ответил ${response.code}")
        json.parseToJsonElement(response.body.string()).list()
    }

    private fun http(url: String) = sharedHttp.newCall(
        Request.Builder().url(url)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "trashee-android/${BuildConfig.VERSION_NAME}")
            .build(),
    ).execute()

    /* ---------- install ---------- */

    fun canInstall(): Boolean = context.packageManager.canRequestPackageInstalls()

    /** Android asks once per app to allow installing; this opens that page. */
    fun openInstallPermissionSettings() {
        context.startActivity(
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    fun install() {
        val info = _state.value.info ?: return
        if (_state.value.status == UpdateStatus.Downloading || _state.value.status == UpdateStatus.Installing) return
        if (!canInstall()) {
            _state.update { it.copy(status = UpdateStatus.NeedPermission, prompt = true) }
            return
        }
        work = scope.launch {
            _state.update { it.copy(status = UpdateStatus.Downloading, prompt = true, received = 0, total = info.apk.size, error = null) }
            try {
                val file = withContext(Dispatchers.IO) { download(info) }
                _state.update { it.copy(status = UpdateStatus.Installing) }
                withContext(Dispatchers.IO) { commit(file) }
            } catch (error: CancellationException) {
                _state.update { it.copy(status = UpdateStatus.Available, received = 0, total = 0) }
                throw error
            } catch (error: Exception) {
                _state.update { it.copy(status = UpdateStatus.Error, error = error.message ?: "Не удалось обновить", prompt = true) }
            }
        }
    }

    private fun download(info: UpdateInfo): File {
        val dir = File(context.cacheDir, "update").apply { deleteRecursively(); mkdirs() }
        val target = File(dir, info.apk.name)
        val digest = MessageDigest.getInstance("SHA-256")
        http(info.apk.url).use { response ->
            if (!response.isSuccessful) error("Сервер ответил ${response.code}")
            val total = response.body.contentLength().takeIf { it > 0 } ?: info.apk.size
            var received = 0L
            var reported = 0L
            response.body.byteStream().use { input ->
                target.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                        digest.update(buffer, 0, count)
                        received += count
                        if (received - reported >= PROGRESS_STEP_BYTES) {
                            reported = received
                            _state.update { it.copy(received = received, total = total) }
                        }
                    }
                }
            }
            _state.update { it.copy(received = received, total = total) }
        }

        info.sumsUrl?.let { sums ->
            val expected = http(sums).use { if (it.isSuccessful) parseChecksums(it.body.string())[info.apk.name] else null }
                ?: error("Для файла нет контрольной суммы")
            val actual = digest.digest().joinToString("") { "%02x".format(it) }
            if (actual != expected) {
                target.delete()
                error("Контрольная сумма не совпала: файл повреждён")
            }
        }
        return target
    }

    private fun commit(file: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            session.openWrite("trashee", 0, file.length()).use { out ->
                file.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            session.commit(InstallReceiver.intentSender(context, id))
        }
    }

    /** The system's answer, from [InstallReceiver]: the update either went through (and this process is replaced) or did not. */
    fun onInstallFailed(message: String?, cancelled: Boolean) {
        file()?.delete()
        _state.update {
            if (cancelled) it.copy(status = UpdateStatus.Available, prompt = true)
            else it.copy(status = UpdateStatus.Error, error = message ?: "Установка не удалась", prompt = true)
        }
    }

    private fun file(): File? = File(context.cacheDir, "update").takeIf { it.exists() }

    /* ---------- the user's answers ---------- */

    fun cancel() {
        work?.cancel()
    }

    fun show() {
        if (_state.value.info != null) _state.update { it.copy(prompt = true) }
    }

    /** "Later" hides the dialog now and keeps it away for a day. */
    fun later() {
        settings = settings.copy(remindAfter = System.currentTimeMillis() + REMIND_LATER_MS)
        save()
        _state.update { it.copy(prompt = false) }
    }

    fun skip() {
        _state.value.info?.let {
            settings = settings.copy(skipped = it.version)
            save()
        }
        _state.update { it.copy(prompt = false) }
    }

    fun dismiss() = _state.update { it.copy(prompt = false) }

    fun setAuto(value: Boolean) {
        settings = settings.copy(auto = value)
        save()
        _state.update { it.copy(auto = value) }
    }

    companion object {
        const val DEFAULT_API = "https://api.github.com/repos/onemorefix1337/trashee"
    }
}
