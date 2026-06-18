import { ConversationType } from '@/shared/api/conversations'
import { getNewMessages } from '@/shared/api/messages-receiver'
import { DbAttachment, DbUser, db } from '@/shared/api/storage'
import { getTargetSwarm } from '@/shared/nodes'
import { store } from '@/shared/store'
import { selectAccount } from '@/shared/store/slices/account'
import { downloadAndDecryptAttachment } from '@/shared/api/attachments'
import _ from 'lodash'
import { v4 as uuid } from 'uuid'

async function downloadMessageAttachments(
  pointers: { url?: string | null, key?: Uint8Array | null, contentType?: string | null, fileName?: string | null, size?: number | null }[]
): Promise<DbAttachment[] | undefined> {
  if (!pointers.length) return undefined
  const results = await Promise.all(pointers.map(async pointer => {
    try {
      const blob = await downloadAndDecryptAttachment(pointer)
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

export async function poll() {
  const targetSwarm = await getTargetSwarm()

  const state = store.getState()
  const account = selectAccount(state)
  if (!account) return

  const messages = await getNewMessages(targetSwarm)
  const dataMessages = messages.filter(msg => msg.content.dataMessage)
  const accountSessionID = account.sessionID
  
  const messagesToAdd = await Promise.all(
    dataMessages
      .map(async msg => {
        const direction = msg.to ? 'outgoing' : 'incoming'
        const conversationID = msg.to ?? msg.envelope.source
        const conversationPathnameRegex = /^\/conversation\/([^/]+)$/
        const inThisDialog = conversationPathnameRegex.test(window.location.pathname) && window.location.pathname.match(conversationPathnameRegex)![1] === conversationID
        const attachments = await downloadMessageAttachments(msg.content.dataMessage!.attachments ?? [])
        return {
          direction,
          conversationID,
          hash: msg.hash,
          accountSessionID,
          textContent: msg.content.dataMessage!.body ?? null,
          attachments,
          read: Number(inThisDialog || direction === 'outgoing') as 0 | 1,
          timestamp: msg.sentAtTimestamp,
          sendingStatus: 'sent',
          id: uuid()
        }
      }
    )
  )
  await db.messages.bulkAdd(messagesToAdd)
  
  const profilesUnfiltered = _.uniqBy(dataMessages.map(msg => ({
    sessionID: msg.to ?? msg.envelope.source,
    displayName: msg.content.dataMessage?.profile?.displayName ?? undefined,
    // profileImage: msg.content.dataMessage?.profile?.profilePicture,
  } satisfies DbUser)), 'sessionID')
  const profiles: DbUser[] = []
  for (const profile of profilesUnfiltered) {
    if(!await db.users.get(profile.sessionID)) {
      profiles.push(profile)
    }
  }
  await db.users.bulkAdd(profiles)

  for (const msg of dataMessages) {
    const sessionID = msg.to ?? msg.from
    const existingConvo = await db.conversations.get({ sessionID, accountSessionID: account.sessionID })
    const displayName = msg.content.dataMessage?.profile?.displayName ?? existingConvo?.displayName ?? undefined
    const body = msg.content.dataMessage?.body
    const previewText = body || (msg.content.dataMessage?.attachments?.length ? '📎 Attachment' : null)
    if (!existingConvo) {
      await db.conversations.add({
        id: uuid(),
        type: ConversationType.DirectMessages,
        accountSessionID,
        sessionID,
        displayName: displayName ?? undefined,
        // profileImage: msg.content.dataMessage?.profile?.profilePicture,
        lastMessage: {
          direction: msg.to ? 'outgoing' : 'incoming',
          textContent: previewText
        },
        lastMessageTime: msg.sentAtTimestamp,
      })
    } else {
      await db.conversations.update(existingConvo.id, {
        displayName: displayName,
        // profileImage: msg.content.dataMessage?.profile?.profilePicture,
        lastMessage: {
          direction: msg.to ? 'outgoing' : 'incoming',
          textContent: previewText
        },
        lastMessageTime: msg.sentAtTimestamp
      })
    }
  }
}