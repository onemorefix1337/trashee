package app.trashee

import app.trashee.update.ReleaseAsset
import app.trashee.update.UpdatePrefs
import app.trashee.update.androidVersionOfTag
import app.trashee.update.compareVersions
import app.trashee.update.isNewer
import app.trashee.update.parseChecksums
import app.trashee.update.parseVersion
import app.trashee.update.pickApk
import app.trashee.update.plainNotes
import app.trashee.update.shouldPrompt
import app.trashee.update.versionCodeOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateLogicTest {
    @Test
    fun `versions parse with or without the v, and reject nonsense`() {
        assertEquals(listOf(1, 2, 3), parseVersion("v1.2.3")!!.let { listOf(it.major, it.minor, it.patch) })
        assertEquals(listOf("beta", "2"), parseVersion("0.10.0-beta.2")!!.pre)
        assertNull(parseVersion("latest"))
        assertNull(parseVersion("1.2"))
    }

    @Test
    fun `versions compare by number, not by text`() {
        assertEquals(-1, compareVersions("0.9.0", "0.10.0"))
        assertEquals(1, compareVersions("1.0.0", "0.99.99"))
        assertEquals(0, compareVersions("v1.0.0", "1.0.0"))
        assertNull(compareVersions("x", "1.0.0"))
    }

    @Test
    fun `a pre-release is older than its release, and betas order by number`() {
        assertEquals(-1, compareVersions("1.0.0-beta.1", "1.0.0"))
        assertEquals(-1, compareVersions("1.0.0-beta.2", "1.0.0-beta.10"))
        assertEquals(1, compareVersions("1.0.0-rc.1", "1.0.0-beta.9"))
    }

    @Test
    fun `only a strictly newer version counts as an update`() {
        assertTrue(isNewer("0.2.0", "0.1.0"))
        assertFalse(isNewer("0.1.0", "0.1.0"))
        assertFalse(isNewer("0.0.9", "0.1.0"))
        assertFalse(isNewer("garbage", "0.1.0"))
    }

    @Test
    fun `tags of the unified release and of the old android releases are read, anything else is not`() {
        assertEquals("0.2.0", androidVersionOfTag("android-v0.2.0"))
        assertEquals("1.0.0", androidVersionOfTag("v1.0.0"))
        assertNull(androidVersionOfTag("vnext"))
        assertNull(androidVersionOfTag("1.0.0"))
        assertNull(androidVersionOfTag("android-vnext"))
        assertNull(androidVersionOfTag("android-0.2.0"))
    }

    @Test
    fun `the release carries one apk`() {
        val assets = listOf(ReleaseAsset("SHA256SUMS.txt", 1, "u"), ReleaseAsset("trashee-android-0.2.0.apk", 5, "a"))
        assertEquals("trashee-android-0.2.0.apk", pickApk(assets)?.name)
        assertNull(pickApk(listOf(ReleaseAsset("notes.txt", 1, "u"))))
    }

    @Test
    fun `checksums are read from sha256sum output`() {
        val hash = "a".repeat(64)
        val other = "B".repeat(64)
        val sums = parseChecksums("$hash  one.apk\n$other *two file.apk\nnot a line\n")
        assertEquals(hash, sums["one.apk"])
        assertEquals("b".repeat(64), sums["two file.apk"])
        assertEquals(2, sums.size)
    }

    @Test
    fun `release notes lose their markdown and are cut to a limit`() {
        val notes = plainNotes("## Что нового\n- **Мини-плеер**\n- [Текст песен](https://x) из LRCLIB\n\n\n\nКонец")
        assertEquals("Что нового\n• Мини-плеер\n• Текст песен из LRCLIB\n\nКонец", notes)
        assertTrue(plainNotes("a".repeat(5000), 100).length <= 101)
    }

    @Test
    fun `a skipped version or a snooze keeps the dialog away, a newer version does not`() {
        val prefs = UpdatePrefs(true, "0.2.0", 1000)
        assertFalse(shouldPrompt("0.2.0", prefs, 5000))
        assertTrue(shouldPrompt("0.3.0", prefs, 5000))
        assertFalse(shouldPrompt("0.3.0", prefs, 500))
        assertTrue(shouldPrompt("0.3.0", prefs.copy(remindAfter = 0), 500))
    }

    @Test
    fun `a bigger version is always a bigger version code`() {
        assertEquals(1, versionCodeOf("0.0.1"))
        assertEquals(10000, versionCodeOf("1.0.0"))
        assertTrue(versionCodeOf("0.10.0") > versionCodeOf("0.9.9"))
        assertTrue(versionCodeOf("1.0.0") > versionCodeOf("0.99.99"))
    }
}
