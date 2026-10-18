package app.trashee.update

/** Everything about updates that does not need Android: versions, tags, checksums, release notes. */

/**
 * One release carries the installers for the computer and the APK: "v1.0.0". Before 1.0 the APK had releases of its
 * own, tagged "android-v0.1.0"; both are still understood. What decides whether a release is for the phone is the APK in it.
 */
private const val LEGACY_TAG_PREFIX = "android-v"

data class Version(val major: Int, val minor: Int, val patch: Int, val pre: List<String>)

private val VERSION = Regex("""^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$""")

fun parseVersion(text: String): Version? {
    val match = VERSION.matchEntire(text.trim()) ?: return null
    val (major, minor, patch, pre) = match.destructured
    return Version(major.toInt(), minor.toInt(), patch.toInt(), if (pre.isEmpty()) emptyList() else pre.split('.'))
}

private fun comparePre(a: List<String>, b: List<String>): Int {
    // A final release is newer than any pre-release of the same number.
    if (a.isEmpty() || b.isEmpty()) return if (a.size == b.size) 0 else if (a.isEmpty()) 1 else -1
    for (i in 0 until maxOf(a.size, b.size)) {
        val left = a.getOrNull(i) ?: return -1
        val right = b.getOrNull(i) ?: return 1
        val numeric = left.all(Char::isDigit) && right.all(Char::isDigit)
        val diff = if (numeric) left.toLong().compareTo(right.toLong()) else left.compareTo(right)
        if (diff != 0) return if (diff < 0) -1 else 1
    }
    return 0
}

/** Negative when [a] is older than [b], positive when newer; null when either is not a version. */
fun compareVersions(a: String, b: String): Int? {
    val left = parseVersion(a) ?: return null
    val right = parseVersion(b) ?: return null
    for ((x, y) in listOf(left.major to right.major, left.minor to right.minor, left.patch to right.patch)) {
        if (x != y) return if (x < y) -1 else 1
    }
    return comparePre(left.pre, right.pre)
}

fun isNewer(candidate: String, current: String): Boolean = (compareVersions(candidate, current) ?: 0) > 0

/** "1.0.0" for the tags "v1.0.0" and "android-v1.0.0"; null for anything else. */
fun androidVersionOfTag(tag: String): String? =
    tag.removePrefix(LEGACY_TAG_PREFIX).removePrefix("v").takeIf { (tag.startsWith("v") || tag.startsWith(LEGACY_TAG_PREFIX)) && parseVersion(it) != null }

data class ReleaseAsset(val name: String, val size: Long, val url: String)

/** The installable file of a release: the one APK it carries. */
fun pickApk(assets: List<ReleaseAsset>): ReleaseAsset? = assets.firstOrNull { it.name.endsWith(".apk", ignoreCase = true) }

private val CHECKSUM_LINE = Regex("""^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$""")

/** Reads the output of `sha256sum`: "<hex>  <name>" or "<hex> *<name>". */
fun parseChecksums(text: String): Map<String, String> =
    text.lineSequence().mapNotNull { CHECKSUM_LINE.matchEntire(it) }.associate { it.groupValues[2] to it.groupValues[1].lowercase() }

/** Release notes are Markdown; the dialog shows them as plain lines. */
fun plainNotes(markdown: String, limit: Int = 1500): String {
    val text = markdown
        .replace("\r\n", "\n")
        .replace(Regex("<!--[\\s\\S]*?-->"), "")
        .replace(Regex("(?m)^#{1,6}\\s*"), "")
        .replace(Regex("(?m)^\\s*[-*+]\\s+"), "• ")
        .replace(Regex("\\[([^\\]]+)]\\([^)]*\\)"), "$1")
        .replace(Regex("(\\*\\*|__|`)"), "")
        .replace(Regex("\n{3,}"), "\n\n")
        .trim()
    return if (text.length > limit) text.take(limit).trimEnd() + "…" else text
}

data class UpdatePrefs(val auto: Boolean = true, val skipped: String? = null, val remindAfter: Long = 0)

const val REMIND_LATER_MS = 24L * 60 * 60 * 1000

/** Whether a version found at startup should interrupt the user: not skipped, and not snoozed. */
fun shouldPrompt(version: String, prefs: UpdatePrefs, now: Long): Boolean {
    if (prefs.skipped == version) return false
    return now >= prefs.remindAfter
}

/** The version number the system compares: 1.2.3 becomes 10203, so a bigger version is always a bigger code. */
fun versionCodeOf(version: String): Int {
    val parsed = parseVersion(version) ?: return 1
    return parsed.major * 10_000 + parsed.minor * 100 + parsed.patch
}
