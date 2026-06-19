import { store } from '@/shared/store'
import { selectAccount } from '@/shared/store/slices/account'
import { notifyIncomingMessage } from '@/shared/notifications'
import { runPoll } from '@/shared/poll-core'

/** Is the user currently viewing this conversation in the page? */
function isActiveConversation(conversationID: string): boolean {
  if (typeof window === 'undefined') return false
  const m = window.location.pathname.match(/\/conversation\/([^/]+)$/)
  return !!m && m[1] === conversationID
}

let inFlight = false

export async function poll() {
  if (inFlight) return // don't let a slow poll overlap the next interval tick
  const account = selectAccount(store.getState())
  if (!account) return

  inFlight = true
  try {
    await doPoll(account)
  } finally {
    inFlight = false
  }
}

async function doPoll(account: { sessionID: string, mnemonic: string }) {
  await runPoll({
    account,
    isActiveConversation,
    // Only surface OS notifications when the tab isn't focused.
    notify: (n) => {
      if (typeof document !== 'undefined' && document.hidden) {
        notifyIncomingMessage(n)
      }
    },
  })
}
