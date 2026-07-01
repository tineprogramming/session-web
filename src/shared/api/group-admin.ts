// Member management for the (fan-out) groups: add / remove / leave. Membership
// is carried in each message's GroupContext roster, so a change is propagated by
// sending an UPDATE (or QUIT) control message with the new roster; receivers
// reconcile their roster and render a system notice (see poll-core.ts).

import { db, getIdentityKeyPair } from '@/shared/api/storage'
import { ConversationType } from '@/shared/api/conversations'
import { VisibleMessage } from '@/shared/api/messages/visibleMessage/VisibleMessage'
import { sendMessage } from '@/shared/api/messages-sender'
import * as UserUtils from '@/shared/api/utils/User'
import { getNowWithNetworkOffset } from '@/shared/api/get-network-time'
import { fromHexToArray, toHex } from '@/shared/api/utils/String'
import { v4 as uuid } from 'uuid'

function isValidSessionID(value: string) {
  return value.startsWith('05') && value.length === 66 && /^[0-9a-f]+$/.test(value)
}

const shortId = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`

async function insertLocalSystem(groupId: string, accountSessionID: string, text: string, timestamp: number) {
  await db.messages.add({
    direction: 'incoming',
    conversationID: groupId,
    hash: 'sys_' + uuid(),
    accountSessionID,
    textContent: text,
    system: true,
    read: 1,
    timestamp,
    sendingStatus: 'sent',
    id: uuid(),
  })
}

/** Send a UPDATE/QUIT control message (new roster) to a set of recipients. */
async function sendControl(opts: {
  groupId: string
  name: string
  roster: string[]
  recipients: string[]
  type: 'UPDATE' | 'QUIT'
}) {
  const { groupId, name, roster, recipients, type } = opts
  const keypair = getIdentityKeyPair()
  if (!keypair) throw new Error('Not signed in')
  const idBytes = fromHexToArray(groupId)
  const timestamp = await getNowWithNetworkOffset()
  const groupCtx = { id: idBytes, name, members: roster, type }
  const msg = new VisibleMessage({
    body: '', lokiProfile: await UserUtils.getOurProfile(), timestamp,
    expirationType: 'unknown', expireTimer: 0, identifier: uuid(),
    attachments: [], preview: [], quote: undefined, group: groupCtx,
  })
  const sync = new VisibleMessage({
    body: '', lokiProfile: undefined, timestamp,
    expirationType: 'unknown', expireTimer: 0, identifier: uuid(),
    attachments: [], preview: [], quote: undefined, reaction: undefined,
    syncTarget: groupId, group: groupCtx,
  })
  const accountSessionID = toHex(keypair.pubKey)
  for (const recipient of recipients) {
    const r = await sendMessage(recipient, msg, sync)
    if (r.ok) {
      await db.messages_seen.put({ hash: r.syncHash, receivedAt: timestamp, accountSessionID })
    }
  }
}

async function getGroup(groupId: string, accountSessionID: string) {
  const convo = await db.conversations.get({ sessionID: groupId, accountSessionID })
  if (!convo || convo.type !== ConversationType.ClosedGroup) throw new Error('Group not found')
  return convo
}

export async function addGroupMember(groupId: string, accountSessionID: string, rawId: string): Promise<void> {
  const newId = rawId.trim().toLowerCase()
  if (!isValidSessionID(newId)) throw new Error('Invalid Session ID')
  if (newId === accountSessionID) throw new Error('You cannot add yourself')
  const convo = await getGroup(groupId, accountSessionID)
  const memberIds = convo.members.map(m => m.sessionID)
  if (memberIds.includes(newId)) return

  const newMembers = [...convo.members, { sessionID: newId }]
  await db.conversations.update(convo.id, { members: newMembers })
  const timestamp = await getNowWithNetworkOffset()
  await insertLocalSystem(groupId, accountSessionID, `${shortId(newId)} was added`, timestamp)

  const roster = [accountSessionID, ...newMembers.map(m => m.sessionID)]
  // Tell everyone (including the new member, so they create the group).
  await sendControl({ groupId, name: convo.displayName, roster, recipients: newMembers.map(m => m.sessionID), type: 'UPDATE' })
}

export async function removeGroupMember(groupId: string, accountSessionID: string, targetId: string): Promise<void> {
  const convo = await getGroup(groupId, accountSessionID)
  if (!convo.members.some(m => m.sessionID === targetId)) return

  const newMembers = convo.members.filter(m => m.sessionID !== targetId)
  await db.conversations.update(convo.id, { members: newMembers })
  const timestamp = await getNowWithNetworkOffset()
  await insertLocalSystem(groupId, accountSessionID, `${shortId(targetId)} was removed`, timestamp)

  const roster = [accountSessionID, ...newMembers.map(m => m.sessionID)]
  // Remaining members get the new roster; the removed member also gets it (the
  // roster excludes them, so their client marks the group as left).
  await sendControl({ groupId, name: convo.displayName, roster, recipients: [...newMembers.map(m => m.sessionID), targetId], type: 'UPDATE' })
}

export async function leaveGroup(groupId: string, accountSessionID: string): Promise<void> {
  const convo = await getGroup(groupId, accountSessionID)
  const memberIds = convo.members.map(m => m.sessionID)
  const timestamp = await getNowWithNetworkOffset()

  // QUIT: receivers drop us from their roster and show "you left".
  const roster = [accountSessionID, ...memberIds]
  await sendControl({ groupId, name: convo.displayName, roster, recipients: memberIds, type: 'QUIT' })

  await db.conversations.update(convo.id, { left: true })
  await insertLocalSystem(groupId, accountSessionID, 'You left the group', timestamp)
}
