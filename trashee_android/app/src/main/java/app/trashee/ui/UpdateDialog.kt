package app.trashee.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import app.trashee.BuildConfig
import app.trashee.update.UpdateStatus
import app.trashee.update.showsDialog

private class Action(val label: String, val kind: Int, val run: () -> Unit)

private const val PRIMARY = 0
private const val SECONDARY = 1
private const val TEXT = 2

private fun formatDate(iso: String): String = iso.take(10).split('-').let { p ->
    if (p.size == 3) "${p[2].toIntOrNull() ?: p[2]}.${p[1]}.${p[0]}" else ""
}

/** Over the whole screen, with the app blurred behind it, whenever the updater has something to say. */
@Composable
fun UpdateDialog() {
    val app = LocalApp.current
    val updater = app.updater
    val state by updater.state.collectAsState()
    val open = state.showsDialog()
    val info = state.info
    val accent = LocalAccent.current

    // Back is "not now": snooze when asked about a new version, just close otherwise.
    BackHandler(enabled = open) { if (state.status == UpdateStatus.Available) updater.later() else updater.dismiss() }
    // Coming back from the system page where installing was allowed: carry on by itself.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (state.status == UpdateStatus.NeedPermission && updater.canInstall()) updater.install()
    }

    AnimatedVisibility(visible = open, enter = fadeIn(tween(250)), exit = fadeOut(tween(200))) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.55f))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                .safeDrawingPadding()
                .padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedVisibility(
                visible = open,
                enter = fadeIn(tween(250)) + scaleIn(initialScale = 0.92f, animationSpec = spring(dampingRatio = 0.75f, stiffness = Spring.StiffnessMediumLow)),
                exit = fadeOut() + scaleOut(targetScale = 0.96f),
            ) {
                if (info == null) return@AnimatedVisibility
                var title = "Доступно обновление"
                var body: String? = null
                var actions = emptyList<Action>()
                var progress: Float? = null
                when (state.status) {
                    UpdateStatus.Available -> actions = listOf(
                        Action("Обновить", PRIMARY) { updater.install() },
                        Action("Напомнить позже", SECONDARY) { updater.later() },
                        Action("Пропустить эту версию", TEXT) { updater.skip() },
                    )
                    UpdateStatus.Downloading -> {
                        title = "Скачиваем версию ${info.version}"
                        progress = if (state.total > 0) (state.received.toFloat() / state.total).coerceIn(0f, 1f) else 0f
                        body = "${formatBytes(state.received)}${if (state.total > 0) " из ${formatBytes(state.total)}" else ""}"
                        actions = listOf(Action("Отмена", SECONDARY) { updater.cancel() }, Action("Скрыть", TEXT) { updater.dismiss() })
                    }
                    UpdateStatus.NeedPermission -> {
                        title = "Нужно разрешение"
                        body = "Чтобы установить обновление, разреши trashee ставить приложения. Android спросит об этом один раз, потом вернись сюда."
                        actions = listOf(
                            Action("Открыть настройки", PRIMARY) { updater.openInstallPermissionSettings() },
                            Action("Закрыть", TEXT) { updater.dismiss() },
                        )
                    }
                    UpdateStatus.Installing -> {
                        title = "Устанавливаем"
                        body = "Подтверди установку в окне Android. Когда она закончится, trashee пришлёт уведомление: нажми на него, чтобы открыть новую версию."
                        actions = listOf(Action("Скрыть", TEXT) { updater.dismiss() })
                    }
                    else -> {
                        title = "Не получилось обновить"
                        body = state.error
                        actions = listOf(
                            Action("Повторить", PRIMARY) { updater.install() },
                            Action("Закрыть", TEXT) { updater.dismiss() },
                        )
                    }
                }

                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(26.dp))
                        .background(Color(0xFF0E0E0F))
                        .padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Logo(size = 40.dp)
                        Column {
                            Text(title, color = Palette.Text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(BuildConfig.VERSION_NAME, color = Palette.Muted, fontSize = 14.sp)
                                Text("→", color = Palette.Muted, fontSize = 14.sp)
                                Text(
                                    info.version, color = Palette.Text, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                                    modifier = Modifier.clip(RoundedCornerShape(50)).background(accent.copy(alpha = 0.22f)).padding(horizontal = 10.dp, vertical = 2.dp),
                                )
                            }
                        }
                    }
                    Text(
                        listOf(formatDate(info.publishedAt), if (info.apk.size > 0) formatBytes(info.apk.size) else "").filter { it.isNotEmpty() }.joinToString(" · "),
                        color = Palette.Muted, fontSize = 12.sp,
                    )
                    if (state.status == UpdateStatus.Available && info.notes.isNotEmpty()) {
                        Text(
                            info.notes,
                            color = Color(0xFFCFCFD4),
                            fontSize = 13.sp,
                            lineHeight = 19.sp,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 200.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .background(Color.White.copy(alpha = 0.05f))
                                .verticalScroll(rememberScrollState())
                                .padding(14.dp),
                        )
                    }
                    if (progress != null) {
                        Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.1f))) {
                            Box(Modifier.fillMaxWidth(progress).height(8.dp).clip(RoundedCornerShape(50)).background(accent))
                        }
                    }
                    body?.let {
                        Text(
                            it,
                            color = if (state.status == UpdateStatus.Error) Palette.Danger else if (progress != null) Palette.Muted else Color(0xFFCFCFD4),
                            fontSize = if (progress != null) 12.sp else 13.sp,
                            lineHeight = 19.sp,
                            textAlign = TextAlign.Start,
                        )
                    }
                    Spacer(Modifier.height(2.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        actions.forEach { action ->
                            when (action.kind) {
                                PRIMARY -> Box(
                                    Modifier.height(48.dp).clip(RoundedCornerShape(24.dp)).background(accent).pressable(onClick = action.run).padding(horizontal = 24.dp),
                                    contentAlignment = Alignment.Center,
                                ) { Text(action.label, color = Color.Black, fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
                                SECONDARY -> SecondaryButton(action.label, onClick = action.run)
                                else -> Box(Modifier.height(44.dp).clip(RoundedCornerShape(22.dp)).pressable(onClick = action.run).padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                                    Text(action.label, color = Palette.Muted, fontSize = 14.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
