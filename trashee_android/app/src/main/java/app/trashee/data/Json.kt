package app.trashee.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

/** Yandex's JSON is loosely shaped; these read a field if it is there and say nothing if it is not. */
operator fun JsonElement?.get(key: String): JsonElement? =
    (this as? JsonObject)?.get(key)?.takeIf { it !is JsonNull }

operator fun JsonElement?.get(index: Int): JsonElement? =
    (this as? JsonArray)?.getOrNull(index)?.takeIf { it !is JsonNull }

fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content

fun JsonElement?.long(): Long? = (this as? JsonPrimitive)?.let { it.longOrNull ?: it.doubleOrNull?.toLong() }

fun JsonElement?.int(): Int? = long()?.toInt()

fun JsonElement?.double(): Double? = (this as? JsonPrimitive)?.doubleOrNull

fun JsonElement?.bool(): Boolean? = (this as? JsonPrimitive)?.booleanOrNull

fun JsonElement?.list(): List<JsonElement> = (this as? JsonArray)?.filter { it !is JsonNull } ?: emptyList()

fun JsonElement?.isEmptyJson(): Boolean = this == null || this is JsonNull
