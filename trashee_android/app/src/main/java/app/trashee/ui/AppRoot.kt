package app.trashee.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.ui.draw.blur
import app.trashee.update.showsDialog
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.R
import app.trashee.data.Session
import app.trashee.data.Toasts

@Composable
fun AppRoot() {
    val app = LocalApp.current
    val session by app.repo.session.collectAsState()
    val ui by app.engine.ui.collectAsState()
    val accent = rememberAccent(ui.track?.coverUri)
    val update by app.updater.state.collectAsState()
    // The app blurs behind the update dialog (Android 12 and newer; older versions just dim it).
    val blur by animateDpAsState(if (update.showsDialog()) 18.dp else 0.dp, tween(300), label = "blur")
    TrasheeTheme(accent) {
        Box(Modifier.fillMaxSize().background(Palette.Bg)) {
            Box(Modifier.fillMaxSize().then(if (blur > 0.dp) Modifier.blur(blur) else Modifier)) {
                AnimatedContent(
                    targetState = session is Session.Ready,
                    transitionSpec = { fadeIn(tween(400)) togetherWith fadeOut(tween(250)) },
                    label = "root",
                ) { ready -> if (ready) MainShell() else LoginScreen(session) }
            }
            UpdateDialog()
        }
    }
}

private data class Tab(val route: Route, val icon: Int, val label: String)

private val TABS = listOf(
    Tab(Route.Wave, R.drawable.ic_wave, "Волна"),
    Tab(Route.Search, R.drawable.ic_search, "Поиск"),
    Tab(Route.Library, R.drawable.ic_library, "Коллекция"),
    Tab(Route.Settings, R.drawable.ic_settings, "Настройки"),
)

@Composable
private fun TabBar(selected: Route, onSelect: (Route) -> Unit) {
    val accent = LocalAccent.current
    // Four labels in a row only fit if the system's large-text setting is not applied to them in full.
    val density = LocalDensity.current
    CompositionLocalProvider(LocalDensity provides Density(density.density, minOf(density.fontScale, 1.1f))) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Palette.Bg)
            .navigationBarsPadding()
            .height(64.dp)
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TABS.forEach { tab ->
            val active = tab.route == selected
            Column(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(16.dp))
                    .pressable(scaleTo = 0.92f) { onSelect(tab.route) }
                    .padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (active) accent.copy(alpha = 0.2f) else androidx.compose.ui.graphics.Color.Transparent)
                        .padding(horizontal = 18.dp, vertical = 4.dp),
                ) {
                    val bounce by androidx.compose.animation.core.animateFloatAsState(
                        if (active) 1.14f else 1f,
                        spring(dampingRatio = Spring.DampingRatioHighBouncy, stiffness = Spring.StiffnessMedium),
                        label = "tabBounce",
                    )
                    Ic(
                        tab.icon, tint = if (active) Palette.Text else Palette.Muted, size = 22.dp,
                        modifier = Modifier.graphicsLayer { scaleX = bounce; scaleY = bounce },
                    )
                }
                Text(
                    tab.label, color = if (active) Palette.Text else Palette.Muted, fontSize = 11.sp,
                    fontWeight = FontWeight.Medium, maxLines = 1, softWrap = false,
                )
            }
        }
    }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MainShell() {
    val app = LocalApp.current
    val nav = remember { Nav() }
    val ui by app.engine.ui.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val hasTrack = ui.track != null

    LaunchedEffect(Unit) {
        Toasts.events.collect { toast ->
            val result = snackbar.showSnackbar(message = toast.text, actionLabel = toast.actionLabel, duration = SnackbarDuration.Short)
            if (result == SnackbarResult.ActionPerformed) toast.action?.invoke()
        }
    }
    // A link shared to the app or opened with it is handled once the main screen is there.
    LaunchedEffect(Unit) {
        app.incomingLink.collect { link ->
            if (link == null) return@collect
            app.incomingLink.value = null
            openYandexLink(app, nav, link)
        }
    }
    // Back closes the player, then steps out of pages, then returns to the first tab before leaving the app.
    BackHandler(enabled = nav.playerOpen || nav.canGoBack || nav.root != Route.Wave) {
        when {
            nav.playerOpen -> nav.playerOpen = false
            nav.canGoBack -> nav.back()
            else -> nav.tab(Route.Wave)
        }
    }

    // While the keyboard is up the bars would only sit on top of it.
    val keyboard = WindowInsets.isImeVisible
    val tabBarHeight = 64.dp
    val miniHeight = 76.dp
    val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val bottom = if (keyboard) 0.dp else tabBarHeight + navInset + if (hasTrack) miniHeight else 0.dp
    val padding = PaddingValues(bottom = bottom)

    CompositionLocalProvider(LocalNav provides nav) {
        Box(Modifier.fillMaxSize()) {
            Ambient(ui.playing, animate = !nav.playerOpen)

            AnimatedContent(
                targetState = nav.current,
                transitionSpec = {
                    val way = if (nav.forward) 1 else -1
                    (fadeIn(tween(260)) + slideInHorizontally(spring(stiffness = Spring.StiffnessMediumLow)) { way * it / 10 }) togetherWith
                        (fadeOut(tween(140)) + slideOutHorizontally(tween(180)) { -way * it / 14 })
                },
                label = "route",
            ) { route ->
                when (route) {
                    Route.Wave -> WaveScreen(padding)
                    Route.Search -> SearchScreen(padding)
                    Route.Library -> LibraryScreen(padding)
                    Route.Settings -> SettingsScreen(padding)
                    is Route.Collection -> CollectionScreen(route.ref, padding)
                    is Route.Similar -> SimilarScreen(route.seed, padding)
                }
            }

            AnimatedVisibility(
                visible = !keyboard,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                Column {
                    AnimatedVisibility(
                        visible = hasTrack && !nav.playerOpen,
                        enter = fadeIn() + expandVertically(spring(stiffness = Spring.StiffnessMediumLow)),
                        exit = fadeOut() + shrinkVertically(),
                    ) { MiniPlayer(onOpen = { nav.playerOpen = true }) }
                    TabBar(selected = nav.root, onSelect = { nav.tab(it) })
                }
            }

            AnimatedVisibility(
                visible = nav.playerOpen,
                enter = slideInVertically(spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow)) { it },
                exit = slideOutVertically(tween(220)) { it },
            ) { PlayerScreen() }

            nav.playlistTarget?.let { PlaylistPickerSheet(it) { nav.playlistTarget = null } }

            // Last, so messages (and their buttons) are above the player too, not hidden behind it.
            SnackbarHost(
                snackbar,
                Modifier.align(Alignment.BottomCenter).padding(bottom = if (nav.playerOpen) navInset + 16.dp else bottom + 8.dp),
            )
        }
    }
}
