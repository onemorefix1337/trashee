package app.trashee.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

object Palette {
    val Bg = Color(0xFF050505)
    val Surface = Color(0xFF0E0E0F)
    val SurfaceHover = Color(0xFF151517)
    val Line = Color(0xFF1C1C1F)
    val Text = Color(0xFFF4F4F5)
    val Muted = Color(0xFF8B8B92)
    val Danger = Color(0xFFFF7A7A)
    val Heart = Color(0xFFFF4D6D)
}

val BrandGradient = Brush.linearGradient(listOf(Color(0xFFFF6B8B), Color(0xFFFF9A62), Color(0xFF8F6BFF)))

/** The color of the current cover, animated; everything that glows or is highlighted reads it. */
val LocalAccent = compositionLocalOf { Color.White }

@Composable
fun TrasheeTheme(accentTarget: Color, content: @Composable () -> Unit) {
    val accent by animateColorAsState(accentTarget, tween(900), label = "accent")
    val scheme = darkColorScheme(
        background = Palette.Bg,
        surface = Palette.Surface,
        onBackground = Palette.Text,
        onSurface = Palette.Text,
        primary = accent,
        onPrimary = Color.Black,
    )
    CompositionLocalProvider(LocalAccent provides accent) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
