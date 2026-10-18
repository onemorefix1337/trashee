package app.trashee

import app.trashee.sync.DeviceStatus
import app.trashee.sync.Handoff
import app.trashee.sync.NowPlaying
import app.trashee.sync.SyncCommand
import app.trashee.sync.SyncTrack
import app.trashee.sync.estimatePositionMs
import app.trashee.sync.handoffWindow
import app.trashee.sync.pairProof
import app.trashee.sync.requestSignature
import app.trashee.sync.sha256Hex
import app.trashee.sync.syncJson
import app.trashee.sync.unwrapToken
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The expected values were produced by src/main/sync/crypto.ts, so the two apps agree on every byte. */
class SyncTest {
    private val token = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"

    @Test
    fun `pairing proof, token unwrapping and request signatures match the desktop app`() {
        assertEquals("f32c81eb1c663067d107da3ed95bf4b8545257582cdf8952e61a0fb418a5e47c", pairProof("123456", "dev-1", "abcd"))
        assertEquals(token, unwrapToken("0cfc14a4d0787f6b5772f134e5ad5d369cec131d6568b9802d8987fcb580da82", "123456", "abcd"))
        assertEquals(
            "5c8d3f7b63e483266b8846d8b3ab90d0a5f9af60b22e76f69f834d573e563bb7",
            requestSignature(token, "POST", "/state", 1_700_000_000_000, "n0nce", """{"a":1}"""),
        )
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", sha256Hex(""))
    }

    @Test
    fun `a signature changes with anything it covers`() {
        val sig = requestSignature(token, "POST", "/state", 1000, "a", "body")
        assertNotEquals(sig, requestSignature(token, "GET", "/state", 1000, "a", "body"))
        assertNotEquals(sig, requestSignature(token, "POST", "/command", 1000, "a", "body"))
        assertNotEquals(sig, requestSignature(token, "POST", "/state", 1001, "a", "body"))
        assertNotEquals(sig, requestSignature(token, "POST", "/state", 1000, "b", "body"))
        assertNotEquals(sig, requestSignature(token, "POST", "/state", 1000, "a", "other"))
    }

    private val track = SyncTrack("1", "Стеклянный город", "Аврора Блу", durationMs = 200_000)

    @Test
    fun `a playing track keeps moving after its state was sent, a paused one does not`() {
        val state = NowPlaying(track = track, playing = true, positionMs = 10_000, at = 1_000)
        assertEquals(12_500, estimatePositionMs(state, 3_500))
        assertEquals(10_000, estimatePositionMs(state.copy(playing = false), 3_500))
        assertEquals(200_000, estimatePositionMs(state, 999_999_999))
        assertEquals(0, estimatePositionMs(state.copy(track = null), 5_000))
        // The computer's clock is 500 ms ahead of the phone's.
        assertEquals(13_000, estimatePositionMs(state, 3_500, clockOffsetMs = 500))
    }

    @Test
    fun `a handoff carries the last few played tracks and the next ones`() {
        val queue = List(500) { "t$it" }
        val (middle, middleIndex) = handoffWindow(queue, 200)
        assertEquals("t200", middle[middleIndex])
        assertEquals(5 + 150 + 1, middle.size)
        val (start, startIndex) = handoffWindow(queue, 1)
        assertEquals(1, startIndex)
        assertEquals("t0", start.first())
        val (end, endIndex) = handoffWindow(queue, 499)
        assertEquals("t499", end[endIndex])
        assertEquals(5 + 1, end.size)
        assertEquals(listOf("a") to 0, handoffWindow(listOf("a"), 0))
    }

    @Test
    fun `messages read what the desktop writes and ignore what they do not know`() {
        val state = syncJson.decodeFromString<NowPlaying>(
            """{"device":"d","name":"Mac","track":{"id":"7","title":"x","artist":"y","durationMs":1000,"extra":1},"playing":true,"positionMs":5,"at":9,"queueLength":2,"index":1,"future":true}""",
        )
        assertEquals("7", state.track?.id)
        assertEquals(true, state.playing)
        val command = syncJson.decodeFromString<SyncCommand>("""{"cmd":"seek","value":12000,"from":{"id":"a","name":"b"}}""")
        assertEquals("seek", command.cmd)
        assertEquals(12000.0, command.value!!, 0.0)
        val devices = syncJson.decodeFromString<List<DeviceStatus>>("""[{"id":"p","name":"Pixel","platform":"android","online":true,"state":null}]""")
        assertNull(devices.single().state)
    }

    @Test
    fun `what the phone sends has the fields the computer checks`() {
        val text = syncJson.encodeToString(Handoff(queue = listOf("1", "2"), index = 1, positionMs = 5000, tracks = listOf(track)))
        assertEquals(true, text.contains("\"queue\":[\"1\",\"2\"]"))
        assertEquals(true, text.contains("\"index\":1"))
        assertEquals(true, text.contains("\"playing\":true"))
    }
}
