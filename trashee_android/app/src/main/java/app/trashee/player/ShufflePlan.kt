package app.trashee.player

import kotlin.random.Random

/**
 * The order a shuffled queue plays in, as positions in the queue: the current track, then [front] (what was asked
 * to play next), then the tracks not heard yet in this pass, and only then the ones that were. A plain random
 * order lets a track come back before the others have had their turn.
 */
fun shuffleOrder(count: Int, current: Int, front: List<Int>, heard: Set<Int>, random: Random): IntArray {
    val placed = HashSet<Int>().apply { add(current); addAll(front) }
    val others = (0 until count).filter { it !in placed }
    val unheard = others.filter { it !in heard }.shuffled(random)
    val again = others.filter { it in heard }.shuffled(random)
    return (listOf(current) + front.distinct().filter { it != current } + unheard + again).toIntArray()
}
