import { Fragment, type JSX } from 'react'
import type { Artist } from '../../../shared/types'
import { openCollection } from '../store/nav'

/** Artist names separated by commas; each one that Yandex knows opens that artist's page. */
export default function ArtistLinks({ artists }: { artists: Artist[] }): JSX.Element {
  return (
    <>
      {artists.map((artist, i) => (
        <Fragment key={`${artist.id}-${i}`}>
          {i > 0 && ', '}
          {artist.id ? (
            <button
              className="link"
              onClick={(event) => {
                // Inside a track row the click must not also start the track.
                event.stopPropagation()
                openCollection({ type: 'artist', id: artist.id })
              }}
            >
              {artist.name}
            </button>
          ) : (
            artist.name
          )}
        </Fragment>
      ))}
    </>
  )
}
