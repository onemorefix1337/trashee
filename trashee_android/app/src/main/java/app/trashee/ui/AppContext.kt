package app.trashee.ui

import androidx.compose.runtime.staticCompositionLocalOf
import app.trashee.TrasheeApp

val LocalApp = staticCompositionLocalOf<TrasheeApp> { error("TrasheeApp is not provided") }
val LocalNav = staticCompositionLocalOf<Nav> { error("Nav is not provided") }
