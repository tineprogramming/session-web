// Apocentro web notifications (PWA). Shown when a new incoming message arrives
// and the tab isn't focused. Uses the service worker registration when present
// so notifications are reliable, falling back to the page Notification API.

const BASE = import.meta.env.BASE_URL

export async function ensureNotificationPermission(): Promise<void> {
  if (typeof Notification === 'undefined') return
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission() } catch { /* ignore */ }
  }
}

export async function notifyIncomingMessage(opts: {
  title: string
  body: string
  conversationID: string
}): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const url = BASE + 'conversation/' + opts.conversationID
  const options: NotificationOptions = {
    body: opts.body,
    icon: BASE + 'android-chrome-192x192.png',
    badge: BASE + 'favicon-32x32.png',
    tag: opts.conversationID,
    data: { url },
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) { await reg.showNotification(opts.title, options); return }
  } catch { /* fall through */ }
  try { new Notification(opts.title, options) } catch { /* ignore */ }
}
