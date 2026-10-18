package app.trashee.widget

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.trashee.MainActivity
import app.trashee.R
import app.trashee.TrasheeApp
import app.trashee.ui.accentOf
import app.trashee.ui.loadCoverBitmap

private val COMPACT = DpSize(180.dp, 70.dp)
private val WIDE = DpSize(250.dp, 70.dp)
private val LARGE = DpSize(250.dp, 130.dp)

private val BASE = Color(0xFF0E0E10)
private val SCRIM = Color(0xBA050505)
private val TEXT = Color(0xFFF4F4F5)
private val MUTED = Color(0xFFB4B4BB)
private val HEART = Color(0xFFFF4D6D)

/** What the widget shows, taken from the player at the moment it is drawn. */
class WidgetData(
    val title: String,
    val artist: String,
    val playing: Boolean,
    val liked: Boolean,
    val cover: Bitmap?,
    val backdrop: Bitmap?,
    val accent: Color,
) {
    val hasTrack get() = title.isNotEmpty()
}

private var cached: Triple<String, Bitmap?, Bitmap?>? = null

/** The cover and a tiny copy of it that, stretched, becomes a soft blurred background; kept while the same track plays. */
private suspend fun coverFor(context: Context, coverUri: String?): Pair<Bitmap?, Bitmap?> {
    val key = coverUri.orEmpty()
    cached?.takeIf { it.first == key }?.let { return it.second to it.third }
    val cover = loadCoverBitmap(context, coverUri, "200x200")
    val backdrop = cover?.let { Bitmap.createScaledBitmap(it, 12, 12, true) }
    cached = Triple(key, cover, backdrop)
    return cover to backdrop
}

/**
 * The widget's data, read from the player inside the composition: while a session of the widget is open it follows the
 * player by itself, and [keepWidgetCurrent] opens a new session whenever the old one has timed out.
 */
@Composable
private fun rememberWidgetData(app: TrasheeApp): WidgetData {
    val state by app.engine.ui.collectAsState()
    val liked by app.repo.likedIds.collectAsState()
    val track = state.track
    val covers by produceState<Pair<Bitmap?, Bitmap?>>(initialValue = null to null, track?.coverUri) {
        value = if (track == null) null to null else coverFor(app, track.coverUri)
    }
    val accent = remember(covers.first) { accentOf(covers.first) }
    return WidgetData(
        title = track?.title.orEmpty(),
        artist = track?.artistNames.orEmpty(),
        playing = state.playing,
        liked = track != null && track.id in liked,
        cover = covers.first,
        backdrop = covers.second,
        accent = if (track == null) Color.White else accent,
    )
}

/** The home-screen widget: cover, title and the controls, in three sizes that follow how it is stretched. */
class TrasheeWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(COMPACT, WIDE, LARGE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val app = context.applicationContext as TrasheeApp
        provideContent { WidgetContent(rememberWidgetData(app)) }
    }
}

@Composable
private fun WidgetContent(data: WidgetData) {
    val size = LocalSize.current
    Box(
        modifier = GlanceModifier.fillMaxSize().cornerRadius(26.dp).background(ColorProvider(BASE))
            .clickable(actionStartActivity<MainActivity>()),
    ) {
        data.backdrop?.let {
            Image(ImageProvider(it), null, GlanceModifier.fillMaxSize(), contentScale = ContentScale.Crop)
        }
        Box(GlanceModifier.fillMaxSize().background(ColorProvider(SCRIM))) {}
        when {
            !data.hasTrack -> Idle(size.width >= WIDE.width)
            size.height >= LARGE.height -> Large(data)
            else -> Compact(data, wide = size.width >= WIDE.width)
        }
    }
}

@Composable
private fun Cover(bitmap: Bitmap?, side: androidx.compose.ui.unit.Dp) {
    val modifier = GlanceModifier.size(side).cornerRadius(side / 4)
    if (bitmap != null) Image(ImageProvider(bitmap), null, modifier, contentScale = ContentScale.Crop)
    else Box(modifier.background(ColorProvider(Color(0x22FFFFFF)))) {}
}

@Composable
private fun Icon(res: Int, label: String, tint: Color, action: androidx.glance.action.Action, box: androidx.compose.ui.unit.Dp = 40.dp) {
    Image(
        provider = ImageProvider(res),
        contentDescription = label,
        colorFilter = ColorFilter.tint(ColorProvider(tint)),
        modifier = GlanceModifier.size(box).padding(box / 4).clickable(action),
    )
}

@Composable
private fun PlayButton(data: WidgetData, box: androidx.compose.ui.unit.Dp) {
    Box(
        modifier = GlanceModifier.size(box).cornerRadius(box / 2).background(ColorProvider(data.accent))
            .clickable(actionRunCallback<ToggleAction>()),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            provider = ImageProvider(if (data.playing) R.drawable.ic_pause else R.drawable.ic_play),
            contentDescription = if (data.playing) "Пауза" else "Играть",
            colorFilter = ColorFilter.tint(ColorProvider(Color.Black)),
            modifier = GlanceModifier.size(box * 0.5f),
        )
    }
}

@Composable
private fun Titles(data: WidgetData, modifier: GlanceModifier, titleSize: Int = 15) {
    Column(modifier) {
        Text(data.title, maxLines = 1, style = TextStyle(color = ColorProvider(TEXT), fontSize = titleSize.sp, fontWeight = FontWeight.Bold))
        Text(data.artist, maxLines = 1, style = TextStyle(color = ColorProvider(MUTED), fontSize = (titleSize - 2).sp))
    }
}

@Composable
private fun Compact(data: WidgetData, wide: Boolean) {
    Row(GlanceModifier.fillMaxSize().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
        Cover(data.cover, 52.dp)
        Spacer(GlanceModifier.width(10.dp))
        Titles(data, GlanceModifier.defaultWeight())
        if (wide) Icon(R.drawable.ic_prev, "Предыдущий", TEXT, actionRunCallback<PreviousAction>())
        PlayButton(data, 44.dp)
        Icon(R.drawable.ic_next, "Следующий", TEXT, actionRunCallback<NextAction>())
        if (wide) Icon(if (data.liked) R.drawable.ic_heart_filled else R.drawable.ic_heart, "Нравится", if (data.liked) HEART else TEXT, actionRunCallback<LikeAction>())
    }
}

@Composable
private fun Large(data: WidgetData) {
    Column(GlanceModifier.fillMaxSize().padding(14.dp)) {
        Row(GlanceModifier.fillMaxWidth().defaultWeight(), verticalAlignment = Alignment.CenterVertically) {
            Cover(data.cover, 76.dp)
            Spacer(GlanceModifier.width(12.dp))
            Titles(data, GlanceModifier.defaultWeight(), titleSize = 17)
        }
        Spacer(GlanceModifier.height(8.dp))
        Row(GlanceModifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
            Icon(if (data.liked) R.drawable.ic_heart_filled else R.drawable.ic_heart, "Нравится", if (data.liked) HEART else TEXT, actionRunCallback<LikeAction>(), 44.dp)
            Spacer(GlanceModifier.width(14.dp))
            Icon(R.drawable.ic_prev, "Предыдущий", TEXT, actionRunCallback<PreviousAction>(), 44.dp)
            Spacer(GlanceModifier.width(8.dp))
            PlayButton(data, 52.dp)
            Spacer(GlanceModifier.width(8.dp))
            Icon(R.drawable.ic_next, "Следующий", TEXT, actionRunCallback<NextAction>(), 44.dp)
            Spacer(GlanceModifier.width(14.dp))
            Icon(R.drawable.ic_wave, "Моя волна", TEXT, actionRunCallback<WaveAction>(), 44.dp)
        }
    }
}

/** Nothing is queued: one tap starts Моя волна. */
@Composable
private fun Idle(wide: Boolean) {
    Row(GlanceModifier.fillMaxSize().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Image(
            provider = ImageProvider(R.drawable.ic_wave),
            contentDescription = null,
            colorFilter = ColorFilter.tint(ColorProvider(TEXT)),
            modifier = GlanceModifier.size(28.dp),
        )
        Spacer(GlanceModifier.width(10.dp))
        Column(GlanceModifier.defaultWeight()) {
            Text("trashee", maxLines = 1, style = TextStyle(color = ColorProvider(TEXT), fontSize = 17.sp, fontWeight = FontWeight.Bold))
            if (wide) Text("Ничего не играет", maxLines = 1, style = TextStyle(color = ColorProvider(MUTED), fontSize = 13.sp))
        }
        Box(
            GlanceModifier.height(40.dp).cornerRadius(20.dp).background(ColorProvider(TEXT)).padding(horizontal = 16.dp)
                .clickable(actionRunCallback<WaveAction>()),
            contentAlignment = Alignment.Center,
        ) {
            Text("Моя волна", maxLines = 1, style = TextStyle(color = ColorProvider(Color.Black), fontSize = 14.sp, fontWeight = FontWeight.Bold))
        }
    }
}
