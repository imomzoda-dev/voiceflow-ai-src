/** Editors register a flush callback so pending autosaves are written before the app quits. */
const flushers = new Set<() => Promise<void>>()

export function registerFlusher(fn: () => Promise<void>): () => void {
  flushers.add(fn)
  return () => flushers.delete(fn)
}

export async function flushAll(): Promise<void> {
  await Promise.allSettled([...flushers].map((f) => f()))
}
