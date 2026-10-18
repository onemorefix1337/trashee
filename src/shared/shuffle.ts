/**
 * Shuffling a queue so that every track plays once before any plays again. Picking a random track each time
 * brings the same ones back long before the others have had a turn.
 *
 * A run is the plan for the pass in progress, as positions in the queue: what is still to come, in order, and
 * what already played (the last one first), so that going back goes back to what was actually heard.
 */
export interface ShuffleRun {
  upcoming: number[]
  history: number[]
}

type Random = () => number

const HISTORY_LIMIT = 500

export function shuffled<T>(items: readonly T[], random: Random = Math.random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const othersThan = (count: number, current: number): number[] =>
  Array.from({ length: count }, (_, i) => i).filter((i) => i !== current)

/** A new pass that starts after the track at [current]. */
export function startRun(count: number, current: number, random: Random = Math.random): ShuffleRun {
  return { upcoming: shuffled(othersThan(count, current), random), history: [] }
}

/**
 * The next track. At the end of a pass it is a fresh random order when [loop] is set (and never the track that
 * just played); otherwise there is none, and `target` is null.
 */
export function stepForward(
  run: ShuffleRun,
  current: number,
  count: number,
  loop: boolean,
  random: Random = Math.random
): { run: ShuffleRun; target: number | null } {
  const history = [current, ...run.history].slice(0, HISTORY_LIMIT)
  if (run.upcoming.length > 0) {
    return { run: { upcoming: run.upcoming.slice(1), history }, target: run.upcoming[0] }
  }
  if (!loop || count < 2) return { run, target: null }
  const [target, ...upcoming] = shuffled(othersThan(count, current), random)
  return { run: { upcoming, history }, target }
}

/** The track heard before this one, if there is one; the current track goes back to being next. */
export function stepBack(
  run: ShuffleRun,
  current: number
): { run: ShuffleRun; target: number | null } {
  if (run.history.length === 0) return { run, target: null }
  const [target, ...history] = run.history
  return { run: { upcoming: [current, ...run.upcoming], history }, target }
}

/** The listener picked a track out of order: it is not to come up again in this pass. */
export function jumpedTo(run: ShuffleRun, current: number, target: number): ShuffleRun {
  if (target === current) return run
  return {
    upcoming: run.upcoming.filter((i) => i !== target),
    history: [current, ...run.history].slice(0, HISTORY_LIMIT)
  }
}

/** [added] tracks were put into the queue at position [at]: they play next, and the positions after them moved. */
export function insertedAt(run: ShuffleRun, at: number, added: number): ShuffleRun {
  const shift = (i: number): number => (i >= at ? i + added : i)
  const fresh = Array.from({ length: added }, (_, i) => at + i)
  return { upcoming: [...fresh, ...run.upcoming.map(shift)], history: run.history.map(shift) }
}
