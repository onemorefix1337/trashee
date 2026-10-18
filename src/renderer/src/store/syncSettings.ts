import { useEffect, useState } from 'react'
import { setSyncEnabled, useSync } from './sync'

export interface Pairing {
  code: string
  expiresAt: number
  addresses: string[]
}

/** The pairing code that is open right now, and the buttons around it. */
export function useSyncSettings(): {
  pairing: Pairing | null
  startPairing: () => Promise<void>
  stopPairing: () => void
  toggle: (on: boolean) => void
  sync: ReturnType<typeof useSync>
} {
  const sync = useSync()
  const [pairing, setPairing] = useState<Pairing | null>(null)

  // Closing the page must not leave a code open on the network.
  useEffect(() => () => window.api.syncCancelPair(), [])

  return {
    sync,
    // Switching sync off takes its code away with it.
    pairing: sync.enabled ? pairing : null,
    startPairing: async () => {
      const started = await window.api.syncPair()
      if (started) setPairing(started)
    },
    stopPairing: () => {
      window.api.syncCancelPair()
      setPairing(null)
    },
    toggle: (on) => void setSyncEnabled(on)
  }
}
