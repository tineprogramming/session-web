/// <reference lib="webworker" />
// Apocentro service worker. Beyond PWA install + notification clicks, it polls
// the user's swarm in the background via Periodic Background Sync so new-message
// notifications arrive even when the page/browser is closed — no push server.

import sodium from 'libsodium-wrappers-sumo'
import { generateKeypair } from '@/shared/api/account-manager'
import { setIdentityKeypair } from '@/shared/api/storage'
import { ensureSnodePool, resetTargetSwarm } from '@/shared/nodes'
import { runPoll } from '@/shared/poll-core'

declare const self: ServiceWorkerGlobalScope

const BASE = import.meta.env.BASE_URL
const PERIODIC_TAG = 'apc-poll'
const SYNC_TAG = 'apc-poll-once'

type Creds = { sessionID: string, mnemonic: string }

// --- tiny IndexedDB store for the account creds the SW needs to poll ----------
function credsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('apc-sw', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveCreds(creds: Creds | null): Promise<void> {
  const db = await credsDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    if (creds) tx.objectStore('kv').put(creds, 'account')
    else tx.objectStore('kv').delete('account')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadCreds(): Promise<Creds | null> {
  const db = await credsDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly')
    const r = tx.objectStore('kv').get('account')
    r.onsuccess = () => resolve((r.result as Creds) ?? null)
    r.onerror = () => reject(r.error)
  })
}

// --- background poll ----------------------------------------------------------
let polling = false

async function backgroundPoll(): Promise<void> {
  if (polling) return
  polling = true
  try {
    // If a page is open and visible it is already polling — don't race it.
    const clients = await self.clients.matchAll({ type: 'window' })
    if (clients.some(c => (c as WindowClient).visibilityState === 'visible')) return
    const creds = await loadCreds()
    if (!creds) return
    await sodium.ready
    const keypair = generateKeypair(creds.mnemonic)
    setIdentityKeypair(keypair)
    resetTargetSwarm()
    await ensureSnodePool()
    await runPoll({
      account: { sessionID: creds.sessionID },
      notify: async ({ title, body, conversationID }) => {
        await self.registration.showNotification(title, {
          body,
          icon: BASE + 'android-chrome-192x192.png',
          badge: BASE + 'favicon-32x32.png',
          tag: conversationID,
          data: { url: BASE + 'conversation/' + conversationID },
        })
      },
    })
  } catch (e) {
    console.warn('[sw] background poll failed', e)
  } finally {
    polling = false
  }
}

// --- lifecycle ----------------------------------------------------------------
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Receive account creds (and logout) from the page.
self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'apc-account' && data.sessionID && data.mnemonic) {
    event.waitUntil(saveCreds({ sessionID: data.sessionID, mnemonic: data.mnemonic }))
  } else if (data.type === 'apc-logout') {
    event.waitUntil(saveCreds(null))
  } else if (data.type === 'apc-poll-now') {
    event.waitUntil(backgroundPoll())
  }
})

// Periodic Background Sync — Chrome wakes the SW on its own schedule.
self.addEventListener('periodicsync', (event: Event) => {
  const e = event as ExtendableEvent & { tag?: string }
  if (e.tag === PERIODIC_TAG) e.waitUntil(backgroundPoll())
})

// One-off Background Sync — fires when connectivity returns.
self.addEventListener('sync', (event: Event) => {
  const e = event as ExtendableEvent & { tag?: string }
  if (e.tag === SYNC_TAG) e.waitUntil(backgroundPoll())
})

// Focus (or open) the app when a notification is tapped.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      if ('focus' in client) {
        await client.focus()
        if (targetUrl && client.navigate) { try { await client.navigate(targetUrl) } catch { /* ignore */ } }
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl)
  })())
})
