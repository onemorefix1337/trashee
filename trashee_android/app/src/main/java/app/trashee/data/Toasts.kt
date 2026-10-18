package app.trashee.data

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/** A short message, optionally with a button next to it. */
data class Toast(val text: String, val actionLabel: String? = null, val action: (() -> Unit)? = null)

/** Short messages for a snackbar, from anywhere in the app. */
object Toasts {
    private val flow = MutableSharedFlow<Toast>(extraBufferCapacity = 8)
    val events: SharedFlow<Toast> = flow.asSharedFlow()

    fun say(text: String) {
        flow.tryEmit(Toast(text))
    }

    /** A message with a button, such as "Playing on the computer" and "Take over". */
    fun say(text: String, actionLabel: String, action: () -> Unit) {
        flow.tryEmit(Toast(text, actionLabel, action))
    }
}
