package app.trashee.data

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/** Short messages for a snackbar, from anywhere in the app. */
object Toasts {
    private val flow = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val events: SharedFlow<String> = flow.asSharedFlow()

    fun say(text: String) {
        flow.tryEmit(text)
    }
}
