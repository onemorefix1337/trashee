package app.trashee.api

import app.trashee.data.LyricLine

private val TIMESTAMP = Regex("""\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]""")
private val OFFSET = Regex("""^\[offset:\s*([+-]?\d+)\s*]""", RegexOption.IGNORE_CASE)

/**
 * Parses LRC: "[mm:ss.xx] line", several stamps per line for a repeated chorus, and the optional [offset:ms] tag.
 * Metadata tags and lines without a stamp are ignored. Lines come back sorted by time.
 */
fun parseLrc(source: String): List<LyricLine> {
    val lines = ArrayList<LyricLine>()
    var offsetMs = 0.0
    for (raw in source.lines()) {
        val line = raw.trim()
        if (line.isEmpty()) continue
        val offset = OFFSET.find(line)
        if (offset != null) {
            offsetMs = offset.groupValues[1].toDouble()
            continue
        }
        val stamps = TIMESTAMP.findAll(line).toList()
        if (stamps.isEmpty()) continue
        val text = TIMESTAMP.replace(line, "").trim()
        for (stamp in stamps) {
            val fraction = stamp.groupValues[3].takeIf { it.isNotEmpty() }?.let { "0.$it".toDouble() } ?: 0.0
            lines += LyricLine(stamp.groupValues[1].toInt() * 60 + stamp.groupValues[2].toInt() + fraction, text)
        }
    }
    // In LRC a positive offset makes the lyrics appear earlier.
    return lines.map { it.copy(time = maxOf(0.0, it.time - offsetMs / 1000)) }.sortedBy { it.time }
}

/** Index of the line being sung at [position] seconds: the last one that has started, or -1 before the first. */
fun activeLine(lines: List<LyricLine>, position: Double): Int {
    var low = 0
    var high = lines.size - 1
    var found = -1
    while (low <= high) {
        val mid = (low + high) ushr 1
        if (lines[mid].time <= position) {
            found = mid
            low = mid + 1
        } else {
            high = mid - 1
        }
    }
    return found
}
