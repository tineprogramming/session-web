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

const AppComponent = React.lazy(() => import('@/app/app.tsx'))

// Self-heal stale deploys: if a lazily-imported chunk fails to load (the page
// was opened before a redeploy and references now-deleted chunk hashes),
// hard-reload once to fetch the current assets instead of showing an error.
function reloadOnceForChunkError() {
  if (sessionStorage.getItem('apc-chunk-reloaded')) return
  sessionStorage.setItem('apc-chunk-reloaded', '1')
  window.location.reload()
}
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); reloadOnceForChunkError() })
window.addEventListener('unhandledrejection', (e) => {
  const msg = String((e as PromiseRejectionEvent)?.reason?.message || (e as PromiseRejectionEvent)?.reason || '')
  if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg)) {
    reloadOnceForChunkError()
  }
})

// Diagnostic hook (lazy, no cost unless called) for verifying libsession-wasm
// loads in the browser while groups v2 is being built.
;(window as unknown as { __apcLibsession?: () => Promise<unknown> }).__apcLibsession =
  () => import('@/shared/api/groups-v2/libsession').then(m => m.getLibsession())

// Register the PWA service worker (notifications + installability).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL })
      .catch(() => { /* ignore */ })
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