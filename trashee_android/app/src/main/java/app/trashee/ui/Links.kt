package app.trashee.ui

import android.content.Context
import android.content.Intent
import app.trashee.TrasheeApp
import app.trashee.api.YandexLink
import app.trashee.data.Collection as MusicCollection
import app.trashee.data.CollectionRef
import app.trashee.data.Toasts
import app.trashee.data.Track
import kotlinx.coroutines.CancellationException

/** Opens what a Yandex Music link points at: a page for albums, artists and playlists, playback for a track. */
suspend fun openYandexLink(app: TrasheeApp, nav: Nav, link: YandexLink) {
    when (link) {
        is YandexLink.Album -> {
            nav.playerOpen = false
            nav.push(Route.Collection(CollectionRef.AlbumRef(link.id)))
        }
        is YandexLink.Artist -> {
            nav.playerOpen = false
            nav.push(Route.Collection(CollectionRef.ArtistRef(link.id)))
        }
        is YandexLink.UserPlaylist -> {
            nav.playerOpen = false
            nav.push(Route.Collection(CollectionRef.Playlist(null, link.kind, null, link.login)))
        }
        is YandexLink.PlaylistUuid -> {
            nav.playerOpen = false
            nav.push(Route.Collection(CollectionRef.Playlist(null, null, link.uuid)))
        }
        is YandexLink.Track -> try {
            val track = (app.repo.api ?: error("Нет связи")).tracks(listOf(link.id)).firstOrNull() ?: error("Трек не найден")
            app.engine.playTracks(listOf(track))
            nav.playerOpen = true
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            Toasts.say("Не удалось открыть ссылку")
        }
    }
}

/** Shares a link to a track via standard Android system share sheet. */
fun shareTrack(context: Context, track: Track) {
    val albumId = track.albums.firstOrNull()?.id
    val webUrl = if (albumId != null) "https://music.yandex.ru/album/$albumId/track/${track.id}" else "https://music.yandex.ru/track/${track.id}"
    val sendIntent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, "${track.title} — ${track.artistNames}")
        putExtra(Intent.EXTRA_TEXT, "${track.title} — ${track.artistNames}\n$webUrl")
    }
    context.startActivity(Intent.createChooser(sendIntent, "Поделиться треком"))
}

/** Shares a link to a collection (album, artist, playlist) via system share sheet. */
fun shareCollection(context: Context, data: MusicCollection, ref: CollectionRef) {
    val url = when (ref) {
        is CollectionRef.AlbumRef -> "https://music.yandex.ru/album/${ref.id}"
        is CollectionRef.ArtistRef -> "https://music.yandex.ru/artist/${ref.id}"
        is CollectionRef.Playlist -> if (ref.uuid != null) {
            "https://music.yandex.ru/playlists/${ref.uuid}"
        } else {
            "https://music.yandex.ru/users/${ref.login ?: "users"}/playlists/${ref.kind ?: 0}"
        }
    }
    val sendIntent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, data.title)
        putExtra(Intent.EXTRA_TEXT, "${data.title}\n$url")
    }
    context.startActivity(Intent.createChooser(sendIntent, "Поделиться"))
}
