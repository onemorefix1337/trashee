package app.trashee.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.palette.graphics.Palette as ColorPalette
import app.trashee.player.coverUrl
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val NEUTRAL = Color(0xFFFFFFFF)

/** The cover as a bitmap of about [size] px, or null when there is none or it cannot be loaded. */
suspend fun loadCoverBitmap(context: Context, coverUri: String?, size: String = "200x200"): Bitmap? {
    val url = coverUrl(coverUri, size) ?: return null
    return try {
        withContext(Dispatchers.Default) {
            val request = ImageRequest.Builder(context).data(url).allowHardware(false).build()
            (SingletonImageLoader.get(context).execute(request) as? SuccessResult)?.image?.toBitmap()
        }
    } catch (error: CancellationException) {
        throw error
    } catch (_: Exception) {
        null
    }
}

/** The color of a cover, brightened so it reads on a dark surface; white when there is none. */
fun accentOf(bitmap: Bitmap?): Color {
    if (bitmap == null) return NEUTRAL
    val palette = ColorPalette.from(bitmap).maximumColorCount(16).generate()
    val swatch = palette.vibrantSwatch ?: palette.dominantSwatch ?: return NEUTRAL
    val hsv = FloatArray(3)
    AndroidColor.colorToHSV(swatch.rgb, hsv)
    hsv[1] = hsv[1].coerceAtLeast(0.35f)
    hsv[2] = hsv[2].coerceAtLeast(0.88f)
    return Color(AndroidColor.HSVToColor(hsv))
}

/** The color of the cover, brightened so it reads on the dark interface; white when there is no cover. */
@Composable
fun rememberAccent(coverUri: String?): Color {
    val context = LocalContext.current
    var color by remember { mutableStateOf(NEUTRAL) }
    LaunchedEffect(coverUri) {
        color = withContext(Dispatchers.Default) { accentOf(loadCoverBitmap(context, coverUri, "100x100")) }
    }
    return color
}
