// Page-side wiring for service-worker background notifications. Sends the
// account creds the SW needs to poll, and registers Periodic Background Sync so
// Chrome wakes the SW even when the page/browser is closed (no push server).
//
// Limitations (web platform): Periodic Background Sync is Chromium-only, needs
// the PWA installed (Add to Home Screen), and the browser controls how often it
// fires (typically not more than a few times per hour). Other browsers / iOS
// fall back to in-page notifications only.

const PERIODIC_TAG = 'apc-poll'

async function getRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  try {
    return (await navigator.serviceWorker.ready)
  } catch {
    return undefined
  }
}

function postToSw(message: unknown) {
  navigator.serviceWorker?.ready
    .then(reg => (reg.active ?? navigator.serviceWorker.controller)?.postMessage(message))
    .catch(() => { /* ignore */ })
}

/** Give the SW the creds it needs to poll, and register background sync. */
export async function enableBackgroundSync(account: { sessionID: string, mnemonic: string }) {
  postToSw({ type: 'apc-account', sessionID: account.sessionID, mnemonic: account.mnemonic })

  const reg = await getRegistration()
  if (!reg) return

  // Periodic Background Sync (Chromium + installed PWA).
  const periodicSync = (reg as unknown as { periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> } }).periodicSync
  if (periodicSync && 'permissions' in navigator) {
    try {
      const status = await navigator.permissions.query({
        // @ts-expect-error not in the standard lib types yet
        name: 'periodic-background-sync',
      })
      if (status.state === 'granted') {
        await periodicSync.register(PERIODIC_TAG, { minInterval: 15 * 60 * 1000 })
      }
    } catch { /* unsupported — ignore */ }
  }
}

/** Stop background polling and clear the SW's stored creds (on logout). */
export async function disableBackgroundSync() {
  postToSw({ type: 'apc-logout' })
  const reg = await getRegistration()
  const periodicSync = (reg as unknown as { periodicSync?: { unregister: (tag: string) => Promise<void> } } | undefined)?.periodicSync
  try { await periodicSync?.unregister(PERIODIC_TAG) } catch { /* ignore */ }
}
