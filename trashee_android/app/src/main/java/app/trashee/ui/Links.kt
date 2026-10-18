package app.trashee.ui

import app.trashee.TrasheeApp
import app.trashee.api.YandexLink
import app.trashee.data.CollectionRef
import app.trashee.data.Toasts
import kotlinx.coroutines.CancellationException

/** Opens what a Yandex Music link points at: a page for albums, artists and playlists, playback for a track. */
suspend fun openYandexLink(app: TrasheeApp, nav: Nav, link: YandexLink) {
    when (link) {
        is YandexLink.Album -> nav.push(Route.Collection(CollectionRef.AlbumRef(link.id)))
        is YandexLink.Artist -> nav.push(Route.Collection(CollectionRef.ArtistRef(link.id)))
        is YandexLink.UserPlaylist -> nav.push(Route.Collection(CollectionRef.Playlist(null, link.kind, null, link.login)))
        is YandexLink.PlaylistUuid -> nav.push(Route.Collection(CollectionRef.Playlist(null, null, link.uuid)))
        is YandexLink.Track -> try {
            val track = (app.repo.api ?: error("Нет связи")).tracks(listOf(link.id)).firstOrNull() ?: error("Трек не найден")
            app.engine.playTracks(listOf(track))
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            Toasts.say("Не удалось открыть ссылку")
        }
    }
}
