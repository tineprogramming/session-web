// Context-agnostic polling core, shared by the page (src/shared/poll.ts) and
// the service worker (src/sw/sw.ts). It must not touch the DOM, redux, or
// `window` so it can run inside a service worker for background notifications.

import { ConversationType } from '@/shared/api/conversations'
import { getNewMessages } from '@/shared/api/messages-receiver'
import { DbAttachment, DbConversation, DbMessage, DbUser, db } from '@/shared/api/storage'
import { getTargetSwarm } from '@/shared/nodes'
import { downloadAndDecryptAttachment } from '@/shared/api/attachments'
import { toHex } from '@/shared/api/utils/String'
import _ from 'lodash'
import { v4 as uuid } from 'uuid'

export type PollNotification = { title: string, body: string, conversationID: string }
export type PollNotifier = (n: PollNotification) => void | Promise<void>

// The page poll (every 10s) and the service-worker background poll can run
// concurrently and fetch the same messages before either marks them seen. Dexie
// still inserts the non-colliding rows, so a key collision is safe to ignore.
function isKeyCollision(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name
  return name === 'BulkError' || name === 'ConstraintError'
}

async function downloadMessageAttachments(
  pointers: { url?: string | null, id?: unknown, key?: Uint8Array | null, digest?: Uint8Array | null, contentType?: string | null, fileName?: string | null, size?: number | null }[]
): Promise<DbAttachment[] | undefined> {
  if (!pointers.length) return undefined
  const results = await Promise.all(pointers.map(async pointer => {
    try {
      const blob = await downloadAndDecryptAttachment({
        url: pointer.url,
        id: pointer.id != null ? String(pointer.id) : undefined,
        key: pointer.key,
        digest: pointer.digest,
        contentType: pointer.contentType,
      })
      return {
        contentType: pointer.contentType ?? blob.type ?? 'application/octet-stream',
        fileName: pointer.fileName ?? undefined,
        size: pointer.size != null ? Number(pointer.size) : undefined,
        blob,
      } satisfies DbAttachment
    } catch {
      return null
    }
  }))
  const ok = results.filter(Boolean) as DbAttachment[]
  return ok.length ? ok : undefined
}

export async function runPoll(opts: {
  account: { sessionID: string }
  /** Whether the user is currently viewing this conversation (page only). */
  isActiveConversation?: (conversationID: string) => boolean
  /** Called for each new incoming message worth notifying about. */
  notify?: PollNotifier
}): Promise<void> {
  const { account } = opts
  const isActive = opts.isActiveConversation ?? (() => false)
  const targetSwarm = await getTargetSwarm()

  const messages = await getNewMessages(targetSwarm)
  const dataMessages = messages.filter(msg => msg.content.dataMessage)
  const accountSessionID = account.sessionID

  const messagesToAddRaw = await Promise.all(
    dataMessages.map(async msg => {
      const group = msg.content.dataMessage?.group
      const direction = msg.to ? 'outgoing' : 'incoming'
      const body = msg.content.dataMessage!.body ?? null
      const rawAttachments = msg.content.dataMessage!.attachments ?? []

      if (group) {
        const groupId = toHex(group.id!)
        if (!body && !rawAttachments.length) {
          return null
        }
        const inThisDialog = isActive(groupId)
        const attachments = await downloadMessageAttachments(rawAttachments)
        return {
          direction,
          conversationID: groupId,
          hash: msg.hash,
          accountSessionID,
          senderID: msg.envelope.source,
          textContent: body,
          attachments,
          read: Number(inThisDialog || direction === 'outgoing') as 0 | 1,
          timestamp: msg.sentAtTimestamp,
          sendingStatus: 'sent',
          id: uuid()
        } satisfies DbMessage
      }

      const conversationID = msg.to ?? msg.envelope.source
      const inThisDialog = isActive(conversationID)
      const attachments = await downloadMessageAttachments(rawAttachments)
      return {
        direction,
        conversationID,
        hash: msg.hash,
        accountSessionID,
        textContent: body,
        attachments,
        read: Number(inThisDialog || direction === 'outgoing') as 0 | 1,
        timestamp: msg.sentAtTimestamp,
        sendingStatus: 'sent',
        id: uuid()
      } satisfies DbMessage
    })
  )
  const messagesToAdd = messagesToAddRaw.filter(Boolean) as DbMessage[]
  try {
    await db.messages.bulkAdd(messagesToAdd)
  } catch (e) {
    if (!isKeyCollision(e)) throw e
  }

  // Notify for newly received incoming messages.
  if (opts.notify) {
    for (const msg of dataMessages) {
      if (msg.to) continue // sync / our own
      const dm = msg.content.dataMessage
      const group = dm?.group
      const hasContent = !!dm?.body || !!dm?.attachments?.length
      if (!hasContent) continue
      const conversationID = group ? toHex(group.id!) : msg.envelope.source
      if (isActive(conversationID)) continue
      const title = dm?.profile?.displayName || group?.name || 'New message'
      const isVoice = dm?.attachments?.some(a => (a.flags ?? 0) === 1)
      const body = dm?.body
        || (isVoice ? '🎤 Voice message' : (dm?.attachments?.length ? '📎 Attachment' : ''))
      await opts.notify({ title, body, conversationID })
    }
  }

  const profilesUnfiltered = _.uniqBy(dataMessages.map(msg => ({
    sessionID: msg.to ?? msg.envelope.source,
    displayName: msg.content.dataMessage?.profile?.displayName ?? undefined,
  } satisfies DbUser)), 'sessionID')
  const profiles: DbUser[] = []
  for (const profile of profilesUnfiltered) {
    if (!await db.users.get(profile.sessionID)) {
      profiles.push(profile)
    }
  }
  try {
    await db.users.bulkAdd(profiles)
  } catch (e) {
    if (!isKeyCollision(e)) throw e
  }

  for (const msg of dataMessages) {
    const group = msg.content.dataMessage?.group
    const body = msg.content.dataMessage?.body
    const atts = msg.content.dataMessage?.attachments
    const previewText = body
      || (atts?.some(a => (a.flags ?? 0) === 1) ? '🎤 Voice message' : (atts?.length ? '📎 Attachment' : null))

    if (group) {
      const groupId = toHex(group.id!)
      const existingConvo = await db.conversations.get({ sessionID: groupId, accountSessionID: account.sessionID })
      const displayName = group.name || existingConvo?.displayName || 'Group'
      const members = (group.members ?? [])
        .filter(m => m !== account.sessionID)
        .map(sessionID => ({ sessionID }))
      const lastMessage = previewText !== null
        ? { direction: (msg.to ? 'outgoing' : 'incoming') as 'incoming' | 'outgoing', textContent: previewText }
        : existingConvo?.lastMessage ?? null
      const lastMessageTime = previewText !== null
        ? msg.sentAtTimestamp
        : existingConvo?.lastMessageTime ?? 0
      if (!existingConvo) {
        await db.conversations.add({
          id: uuid(),
          type: ConversationType.ClosedGroup,
          accountSessionID,
          sessionID: groupId,
          displayName,
          members,
          lastMessage,
          lastMessageTime,
        })
      } else {
        await db.conversations.update(existingConvo.id, {
          displayName,
          members,
          lastMessage,
          lastMessageTime,
        } as Partial<DbConversation>)
      }
      continue
    }

    const sessionID = msg.to ?? msg.from
    const existingConvo = await db.conversations.get({ sessionID, accountSessionID: account.sessionID })
    const displayName = existingConvo?.displayName ?? msg.content.dataMessage?.profile?.displayName ?? undefined
    if (!existingConvo) {
      await db.conversations.add({
        id: uuid(),
        type: ConversationType.DirectMessages,
        accountSessionID,
        sessionID,
        displayName: displayName ?? undefined,
        lastMessage: {
          direction: msg.to ? 'outgoing' : 'incoming',
          textContent: previewText
        },
        lastMessageTime: msg.sentAtTimestamp,
      })
    } else {
      await db.conversations.update(existingConvo.id, {
        displayName: displayName,
        lastMessage: {
          direction: msg.to ? 'outgoing' : 'incoming',
          textContent: previewText
        },
        lastMessageTime: msg.sentAtTimestamp
      })
    }
  }
}
