package app.trashee

import app.trashee.player.shuffleOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class ShuffleOrderTest {
    @Test
    fun `every track is in the order exactly once and the current one is first`() {
        repeat(200) { seed ->
            val order = shuffleOrder(30, current = seed % 30, front = emptyList(), heard = emptySet(), random = Random(seed))
            assertEquals((0 until 30).toList(), order.sorted())
            assertEquals(seed % 30, order[0])
        }
    }

    @Test
    fun `what was asked to play next comes right after the current track`() {
        val order = shuffleOrder(10, current = 4, front = listOf(8, 9), heard = emptySet(), random = Random(1))
        assertEquals(listOf(4, 8, 9), order.take(3))
        assertEquals((0 until 10).toList(), order.sorted())
    }

    @Test
    fun `tracks not heard yet all come before the ones that were`() {
        repeat(100) { seed ->
            val heard = setOf(0, 1, 2, 3)
            val order = shuffleOrder(10, current = 3, front = emptyList(), heard = heard, random = Random(seed))
            val rest = order.drop(1)
            val firstHeard = rest.indexOfFirst { it in heard }
            assertTrue(rest.drop(firstHeard).all { it in heard })
            assertEquals(6, firstHeard)
        }
    }

    @Test
    fun `a queue of one track is just that track`() {
        assertEquals(listOf(0), shuffleOrder(1, 0, emptyList(), emptySet(), Random(0)).toList())
    }
}
