package app.trashee.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.trashee.data.CollectionRef
import app.trashee.data.Track

sealed interface Route {
    data object Wave : Route
    data object Search : Route
    data object Library : Route
    data object Settings : Route
    data class Collection(val ref: CollectionRef) : Route
    data class Similar(val seed: Track) : Route
}

/** A stack of screens: tabs replace it, everything else is pushed on top and popped with Back. */
class Nav {
    val stack = mutableStateListOf<Route>(Route.Wave)
    var playerOpen by mutableStateOf(false)

    /** Which way the last change went, so screens slide in from the right when going deeper and from the left when coming back. */
    var forward by mutableStateOf(true)
        private set

    val current: Route get() = stack.last()
    val canGoBack: Boolean get() = stack.size > 1
    val root: Route get() = stack.first()

    fun tab(route: Route) {
        if (stack.size == 1 && stack[0] == route) return
        forward = TAB_ORDER.indexOf(route) >= TAB_ORDER.indexOf(root)
        stack.clear()
        stack.add(route)
    }

    fun push(route: Route) {
        playerOpen = false
        forward = true
        stack.add(route)
    }

    fun back() {
        if (stack.size > 1) {
            forward = false
            stack.removeAt(stack.lastIndex)
        }
    }

    private companion object {
        val TAB_ORDER = listOf(Route.Wave, Route.Search, Route.Library, Route.Settings)
    }
}
