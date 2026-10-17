import type { JSX } from 'react'
import { usePlayer } from '../store/player'

/** Slowly drifting color blobs behind the interface; they wake up while music plays. */
export default function Ambient(): JSX.Element {
  const playing = usePlayer((s) => s.playing)
  return (
    <div className={`ambient${playing ? ' live' : ''}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  )
}
