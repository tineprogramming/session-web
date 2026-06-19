// Resend a previously-failed outgoing message (tap the ⚠️ icon, or auto-retry
// when the network comes back). Mirrors the send path in
// conversation-message-input.tsx but reads everything from the stored message.

import { db, DbMessage, DbAttachment, getIdentityKeyPair } from '@/shared/api/storage'
import { ConversationType } from '@/shared/api/conversations'
import { VisibleMessage } from '@/shared/api/messages/visibleMessage/VisibleMessage'
import { sendMessage } from '@/shared/api/messages-sender'
import * as UserUtils from '@/shared/api/utils/User'
import { encryptAndUploadAttachment } from '@/shared/api/attachments'
import { getNowWithNetworkOffset } from '@/shared/api/get-network-time'
import { fromHexToArray } from '@/shared/api/utils/String'
import { v4 as uuid } from 'uuid'

// Avoid sending the same message twice (double tap, or a tap racing the
// online-event auto-retry).
const inFlight = new Set<string>()

async function reuploadAttachments(attachments: DbAttachment[]) {
  const pointers = []
  for (const a of attachments) {
    const file = new File([a.blob], a.fileName ?? 'attachment', {
      type: a.contentType ?? 'application/octet-stream',
    })
    const uploaded = await encryptAndUploadAttachment(file)
    // Preserve the voice-message flag so the receiver still renders a player.
    if (a.contentType?.startsWith('audio/') && (a.fileName ?? '').startsWith('voice-message')) {
      uploaded.pointer.flags = 1 // AttachmentPointer.Flags.VOICE_MESSAGE
    }
    pointers.push(uploaded.pointer)
  }
  return pointers
}

export async function resendMessage(message: DbMessage): Promise<boolean> {
  if (message.direction !== 'outgoing' || message.sendingStatus === 'sent') return false
  if (!getIdentityKeyPair()) return false
  if (inFlight.has(message.hash)) return false
  inFlight.add(message.hash)
  try {
    await db.messages.update(message.hash, { sendingStatus: 'sending' })

    const accountSessionID = message.accountSessionID
    const conversationID = message.conversationID
    const timestamp = message.timestamp || await getNowWithNetworkOffset()
    const body = message.textContent ?? ''
    const attachments = message.attachments?.length ? await reuploadAttachments(message.attachments) : []

    const conversation = await db.conversations.get({ sessionID: conversationID, accountSessionID })

    if (conversation?.type === ConversationType.ClosedGroup) {
      const memberSessionIDs = conversation.members.map(m => m.sessionID)
      const fullRoster = [accountSessionID, ...memberSessionIDs]
      const groupContext = {
        id: fromHexToArray(conversationID),
        name: conversation.displayName,
        members: fullRoster,
        type: 'DELIVER' as const,
      }
      const messageInstance = new VisibleMessage({
        body, lokiProfile: await UserUtils.getOurProfile(), timestamp,
        expirationType: 'unknown', expireTimer: 0, identifier: uuid(),
        attachments, preview: [], quote: undefined, group: groupContext,
      })
      const syncMessage = new VisibleMessage({
        attachments, body, expirationType: 'unknown', expireTimer: 0, identifier: uuid(),
        preview: [], lokiProfile: undefined, quote: undefined, reaction: undefined,
        syncTarget: conversationID, timestamp, group: groupContext,
      })
      let anyOk = false
      for (const member of memberSessionIDs) {
        const r = await sendMessage(member, messageInstance, syncMessage)
        if (r.ok) {
          anyOk = true
          await db.messages_seen.put({ hash: r.syncHash, receivedAt: timestamp, accountSessionID })
        }
      }
      await db.messages.update(message.hash, { sendingStatus: anyOk ? 'sent' : 'error' })
      return anyOk
    }

    // Direct message.
    const messageInstance = new VisibleMessage({
      body, lokiProfile: await UserUtils.getOurProfile(), timestamp,
      expirationType: 'unknown', expireTimer: 0, identifier: uuid(),
      attachments, preview: [], quote: undefined,
    })
    const syncMessage = new VisibleMessage({
      attachments, body, expirationType: 'unknown', expireTimer: 0, identifier: uuid(),
      preview: [], lokiProfile: undefined, quote: undefined, reaction: undefined,
      syncTarget: conversationID, timestamp,
    })
    const result = await sendMessage(conversationID, messageInstance, syncMessage)
    if (result.ok) {
      await db.messages.update(message.hash, { hash: result.syncHash, sendingStatus: 'sent' })
      await db.messages_seen.put({ hash: result.syncHash, receivedAt: timestamp, accountSessionID })
      return true
    }
    await db.messages.update(message.hash, { sendingStatus: 'error' })
    return false
  } catch {
    await db.messages.update(message.hash, { sendingStatus: 'error' }).catch(() => { /* ignore */ })
    return false
  } finally {
    inFlight.delete(message.hash)
  }
}

/** Resend every failed outgoing message for the account (e.g. on reconnect). */
export async function retryFailedMessages(accountSessionID: string): Promise<void> {
  const failed = await db.messages
    .where('sendingStatus').equals('error')
    .filter(m => m.direction === 'outgoing' && m.accountSessionID === accountSessionID)
    .toArray()
  for (const m of failed) {
    await resendMessage(m)
  }
}
