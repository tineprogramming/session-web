// Real, stage-based app-load progress shared between the loader UI (AppLoader)
// and the staged async loaders. Each stage reports when its async work finishes
// (libsodium init, IndexedDB check, i18n init, app chunk download), so the bar
// reflects actual loading rather than a decorative animation.

let current = 0
const listeners = new Set<(n: number) => void>()

export function setLoadProgress(n: number) {
  current = Math.min(100, Math.max(current, n)) // monotonic, capped at 100
  for (const l of listeners) l(current)
}

export function getLoadProgress(): number {
  return current
}

export function onLoadProgress(cb: (n: number) => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
