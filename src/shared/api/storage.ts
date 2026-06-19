import { SessionKeyPairLibsodiumSumo as SessionKeyPair } from '../../../types/keypairs'
import { PubKey } from '@/shared/api/pubkey'
import { HexKeyPair } from '@/shared/api/eckeypair'
import Dexie, { Table } from 'dexie'
import { Conversation } from '@/shared/api/conversations'
import { toHex } from '@/shared/api/utils/String'
import { indexedDB as fakeIndexedDB, IDBKeyRange as fakeIDBKeyRange } from 'fake-indexeddb'

type BooleanAsNumber = 0 | 1

export type DbAccount = {
  sessionID: string
  mnemonic: string
  displayName?: string
  profileImage?: Blob
}

export type DbConversation = {
  id: string
  accountSessionID: string
  sessionID: string
  lastMessage: {
    direction: 'incoming' | 'outgoing'
    textContent: string | null
  } | null
  lastMessageTime: number
  /** Set when you left the group or were removed: read-only, composer hidden. Not indexed. */
  left?: boolean
} & Conversation

export type DbAttachment = {
  contentType: string
  fileName?: string
  size?: number
  /** Decrypted content, stored locally for display. */
  blob: Blob
}

export type DbMessage = {
  direction: 'incoming' | 'outgoing'
  accountSessionID: string
  hash: string
  /** Generated and used internally */
  id: string
  conversationID: string
  read: BooleanAsNumber
  textContent: string | null
  /** Decrypted attachments (images / files), if any. Not indexed. */
  attachments?: DbAttachment[]
  timestamp: number
  sendingStatus: 'sending' | 'error' | 'sent'
  /** For group messages: the Session ID of the sender. Not indexed, undefined for DMs. */
  senderID?: string
  /** Centered "X added", "Y left" notices rather than a chat bubble. Not indexed. */
  system?: boolean
}

export type DbUser = {
  sessionID: string
  displayName?: string
  profileImage?: Blob
}

export type DbMessageSeen = {
  hash: string
  receivedAt: number
  accountSessionID: string
}

export class SessionWebDatabase extends Dexie {
  accounts!: Table<DbAccount>
  conversations!: Table<DbConversation>
  messages!: Table<DbMessage>
  users!: Table<DbUser>
  messages_seen!: Table<DbMessageSeen>

  constructor() {
    super('session-web', (typeof window !== 'undefined' && window.shimmedIndexedDb) ? { indexedDB: fakeIndexedDB, IDBKeyRange: fakeIDBKeyRange } : undefined)
    this.version(1).stores({
      accounts: 'sessionID',
      conversations: 'id, sessionID, accountSessionID, [id+accountSessionID], [sessionID+accountSessionID], lastMessageTime',
      messages: 'hash, id, conversationID, read, accountSessionID, [conversationID+accountSessionID], [conversationID+accountSessionID+read], sendingStatus, [conversationID+accountSessionID+hash+sendingStatus]',
      users: 'sessionID',
      messages_seen: 'hash, receivedAt, accountSessionID'
    })
  }
}

export const db = new SessionWebDatabase()

export type SessionKeyPairStorage = {
  ed25519KeyPair: {
    keyType: SessionKeyPair['ed25519KeyPair']['keyType']
    privateKey: number[]
    publicKey: number[]
  }
  privKey: string
  pubKey: string
}

let identityKeyPair: SessionKeyPair | undefined

export function getIdentityKeyPair(): SessionKeyPair | undefined {
  return identityKeyPair
}

export function setIdentityKeypair(keypair: SessionKeyPair | undefined) {
  identityKeyPair = keypair
}

export async function isMessageSeen(hash: string) {
  return Boolean(await db.messages_seen.get(hash))
}

export async function setMessageSeen(hash: string) {
  const keypair = getIdentityKeyPair()
  if (!keypair) throw new Error('No identity keypair found')
  // put (not add) so concurrent pollers (page + service worker) racing on the
  // same hash don't throw a ConstraintError.
  await db.messages_seen.put({
    hash,
    receivedAt: Date.now(),
    accountSessionID: toHex(keypair.pubKey)
  })
}

/**
 * The returned array is ordered based on the timestamp, the latest is at the end.
 */
export async function getAllEncryptionKeyPairsForGroup(
  groupPublicKey: string | PubKey
): Promise<Array<HexKeyPair> | undefined> {
  const pubkey = (groupPublicKey as PubKey).key || (groupPublicKey as string)
  const items = typeof window !== 'undefined' ? window.localStorage.getItem('group-'+pubkey) : null
  return items ? JSON.parse(items) : undefined
}