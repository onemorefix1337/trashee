package app.trashee.widget

import android.content.Context
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.updateAll
import app.trashee.TrasheeApp
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class TrasheeWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TrasheeWidget()
}

/** Redraws the widget when the track, play or pause, or the like of the current track changes. */
@OptIn(FlowPreview::class)
fun keepWidgetCurrent(app: TrasheeApp) {
    app.scope.launch {
        combine(
            app.engine.ui.map { Triple(it.track?.id, it.playing, it.loading) }.distinctUntilChanged(),
            app.repo.likedIds,
        ) { state, liked -> state to (state.first != null && state.first in liked) }
            .distinctUntilChanged()
            .debounce(250)
            .collect { TrasheeWidget().updateAll(app as Context) }
    }
}
