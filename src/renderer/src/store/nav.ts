import { useSyncExternalStore } from 'react'
import { refKey } from '../../../shared/collections'
import type { CollectionRef } from '../../../shared/types'

/** The track a "similar" page was opened from; enough to draw its header while the list loads. */
export interface SimilarSeed {
  id: string
  title: string
  artist: string
  coverUri?: string
}

export type Route =
  | { page: 'player' }
  | { page: 'search'; focus: number }
  | { page: 'library' }
  | { page: 'settings' }
  | { page: 'collection'; ref: CollectionRef }
  | { page: 'similar'; seed: SimilarSeed }

const MAX_HISTORY = 40

let route: Route = { page: 'player' }
const history: Route[] = []
const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const notify = (): void => listeners.forEach((listener) => listener())

/** Key for page transitions: changes when the visible page changes, not on a mere re-focus. */
export function routeKey(current: Route): string {
  switch (current.page) {
    case 'collection':
      return `collection:${refKey(current.ref)}`
    case 'similar':
      return `similar:${current.seed.id}`
    default:
      return current.page
  }
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => route)
}

export function useCanGoBack(): boolean {
  return useSyncExternalStore(subscribe, () => history.length > 0)
}

export function navigate(next: Route): void {
  // Re-opening the page that is already open (or re-focusing search) must not pile up history.
  if (routeKey(next) !== routeKey(route)) {
    history.push(route)
    if (history.length > MAX_HISTORY) history.shift()
  }
  route = next
  notify()
}

export function back(): void {
  const previous = history.pop()
  if (!previous) return
  route = previous
  notify()
}

/** Opens the search page; every call re-focuses the input, even when it is already open. */
export function openSearch(): void {
  navigate({ page: 'search', focus: Date.now() })
}

export function openCollection(ref: CollectionRef): void {
  navigate({ page: 'collection', ref })
}

export function openSimilar(seed: SimilarSeed): void {
  navigate({ page: 'similar', seed })
}

/** After signing out nothing from the previous session should be reachable with "back". */
export function resetNavigation(): void {
  history.length = 0
  route = { page: 'player' }
  notify()
}
