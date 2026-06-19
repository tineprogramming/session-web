import '@/shared/styles/global.css'
import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { persistor, store } from '@/shared/store'
import { ThemeProvider } from '@/app/theme-provider'
import { PersistGate } from 'redux-persist/integration/react'
import { AppLoader } from '@/widgets/loader'
import { ErrorBoundary } from '@/app/error-boundary'
import { SodiumLoader } from '@/app/sodium-loader'
import { IndexedDbLoader } from '@/app/indexeddb-loader'
import { I18nLoader } from '@/app/i18n-loader'

import { setLoadProgress } from '@/shared/load-progress'

setLoadProgress(10) // boot started (entry chunk downloaded + executing)

const AppComponent = React.lazy(() =>
  import('@/app/app.tsx').then(m => { setLoadProgress(88); return m }))

// Self-heal stale deploys: if a lazily-imported chunk fails to load (the page
// was opened before a redeploy and references now-deleted chunk hashes),
// hard-reload once to fetch the current assets.
function hardReloadOnce(): boolean {
  if (sessionStorage.getItem('apc-chunk-reloaded')) return false
  sessionStorage.setItem('apc-chunk-reloaded', '1')
  window.location.reload()
  return true
}
window.addEventListener('vite:preloadError', (e) => {
  // Only swallow (preventDefault) if we're actually going to reload. Calling
  // preventDefault WITHOUT reloading makes the dynamic import resolve to
  // undefined -> "Cannot read properties of undefined (reading 'default')",
  // so when we've already retried this session, let the error surface normally.
  if (sessionStorage.getItem('apc-chunk-reloaded')) return
  e.preventDefault()
  hardReloadOnce()
})
window.addEventListener('unhandledrejection', (e) => {
  const msg = String((e as PromiseRejectionEvent)?.reason?.message || (e as PromiseRejectionEvent)?.reason || '')
  if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg)) {
    hardReloadOnce()
  }
})

// Diagnostic hook (lazy, no cost unless called) for verifying libsession-wasm
// loads in the browser while groups v2 is being built.
;(window as unknown as { __apcLibsession?: () => Promise<unknown> }).__apcLibsession =
  () => import('@/shared/api/groups-v2/libsession').then(m => m.getLibsession())

// Register the PWA service worker (notifications + installability). Deferred to
// idle so the large SW bundle doesn't compete with the initial app load on slow
// connections.
if ('serviceWorker' in navigator) {
  const register = () => navigator.serviceWorker
    .register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL })
    .catch(() => { /* ignore */ })
  window.addEventListener('load', () => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback
    if (ric) ric(register, { timeout: 10000 })
    else setTimeout(register, 4000)
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<AppLoader />}>
      <ThemeProvider>
        <Provider store={store}>
          <PersistGate loading={null} persistor={persistor}>
            <ErrorBoundary>
              <SodiumLoader>
                <IndexedDbLoader>
                  <I18nLoader>
                    <AppComponent />
                  </I18nLoader>
                </IndexedDbLoader>
              </SodiumLoader>
            </ErrorBoundary>
          </PersistGate>
        </Provider>
      </ThemeProvider>
    </Suspense>
  </React.StrictMode>,
)