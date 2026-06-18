// Apocentro client-side onion routing — path building, send, response peel.
//
// The client picks guard + middle relays at random and uses the recipient's
// swarm snode as the exit, builds a 3-layer AES-256-GCM onion entirely in the
// browser, and sends the opaque outer bytes to the backend's blind /forward
// endpoint. The backend never sees the request or its destination (spec §3).

import _ from 'lodash'
import {
  Snode,
  LayerContext,
  encryptForNode,
  encodeLayer,
  aesGcmDecrypt,
  concatBytes,
  uint32LE,
  bytesToHex,
  toBase64,
  fromBase64,
} from '@/shared/api/onion-crypto'

const BACKEND = import.meta.env.VITE_BACKEND_URL

let snodePool: Snode[] = []

export function setSnodePool(snodes: Snode[]) {
  snodePool = snodes
}

export function getSnodePool(): Snode[] {
  return snodePool
}

function pickRelays(exit: Snode): { guard: Snode; middle: Snode } {
  const exclude = new Set([exit.ed25519])
  const pool = snodePool.filter(s => !exclude.has(s.ed25519))
  const guard = _.sample(pool) as Snode
  const middle = _.sample(pool.filter(s => s.ed25519 !== guard.ed25519)) as Snode
  if (!guard || !middle) throw new Error('Not enough snodes for an onion path')
  return { guard, middle }
}

type BuiltOnion = {
  payload: Uint8Array
  guard: Snode
  keys: { exit: Uint8Array; middle: Uint8Array; guard: Uint8Array }
}

async function buildOnion(rpcBody: object, guard: Snode, middle: Snode, exit: Snode): Promise<BuiltOnion> {
  const rpcBytes = new TextEncoder().encode(JSON.stringify(rpcBody))

  // Layer 3 — exit (destination snode, processes the request locally)
  const exitPlain = encodeLayer(rpcBytes, { headers: {}, enc_type: 'aes-gcm' })
  const exitCtx = await encryptForNode(exit.x25519, exitPlain)

  // Layer 2 — middle relay
  const middlePlain = encodeLayer(exitCtx.ciphertext, {
    destination: exit.ed25519,
    ephemeral_key: bytesToHex(exitCtx.ephemeralKey),
    enc_type: 'aes-gcm',
  })
  const middleCtx = await encryptForNode(middle.x25519, middlePlain)

  // Layer 1 — guard relay (outermost)
  const guardPlain = encodeLayer(middleCtx.ciphertext, {
    destination: middle.ed25519,
    ephemeral_key: bytesToHex(middleCtx.ephemeralKey),
    enc_type: 'aes-gcm',
  })
  const guardCtx: LayerContext = await encryptForNode(guard.x25519, guardPlain)

  // Outer body for the guard's /onion_req/v2
  const payload = concatBytes(
    uint32LE(guardCtx.ciphertext.length),
    guardCtx.ciphertext,
    new TextEncoder().encode(JSON.stringify({ ephemeral_key: bytesToHex(guardCtx.ephemeralKey) })),
  )

  return {
    payload,
    guard,
    keys: { exit: exitCtx.symmetricKey, middle: middleCtx.symmetricKey, guard: guardCtx.symmetricKey },
  }
}

async function peelResponse(dataB64: string, keys: BuiltOnion['keys']): Promise<unknown> {
  const responseBytes = fromBase64(dataB64)
  // The guard returns text that is a base64 string of the AES-GCM response blob.
  const inner = new TextDecoder().decode(responseBytes).trim()
  let encryptedBlob: Uint8Array
  try {
    encryptedBlob = fromBase64(inner)
  } catch {
    encryptedBlob = responseBytes
  }
  // The response is encrypted by the exit node with the exit-layer symmetric key.
  for (const key of [keys.exit, keys.middle, keys.guard]) {
    try {
      const plaintext = await aesGcmDecrypt(key, encryptedBlob)
      const text = new TextDecoder().decode(plaintext)
      return JSON.parse(text)
    } catch {
      // try the next key
    }
  }
  throw new Error('Failed to decrypt onion response')
}

/**
 * Perform a storage_rpc call through a 3-hop onion. `exit` must be a snode in the
 * swarm that should process the request (for store/retrieve) or any snode (for
 * network-info calls like get_swarm).
 */
export async function onionRpc(
  method: string,
  params: Record<string, unknown>,
  exit: Snode,
): Promise<{ status: number; body: unknown }> {
  if (snodePool.length < 3) throw new Error('Snode pool too small for onion routing')
  const { guard, middle } = pickRelays(exit)
  const { payload, keys } = await buildOnion({ method, params }, guard, middle, exit)

  const response = await fetch(BACKEND + '/forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guard: { ip: guard.ip, port: guard.port }, payload: toBase64(payload) }),
  })
  const json = (await response.json()) as { ok: boolean; data?: string; error?: string }
  if (!json.ok || !json.data) throw new Error(json.error || 'Onion forward failed')

  const peeled = (await peelResponse(json.data, keys)) as { status?: number; body?: unknown }
  // Onion v2 responses are usually { status, body } where body is a JSON string.
  let body: unknown = peeled
  let status = 200
  if (peeled && typeof peeled === 'object' && 'body' in peeled) {
    status = typeof peeled.status === 'number' ? peeled.status : 200
    body = typeof peeled.body === 'string' ? safeJson(peeled.body) : peeled.body
  }
  return { status, body }
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s) } catch { return s }
}

type SnodeSwarmEntry = {
  ip: string
  port: string | number
  pubkey_x25519: string
  pubkey_ed25519: string
}

/** Look up a pubkey's swarm through the onion (no exit-node dependency). */
export async function onionGetSwarm(pubkey: string): Promise<Snode[]> {
  if (snodePool.length < 3) throw new Error('Snode pool too small for onion routing')
  const exit = _.sample(snodePool) as Snode
  const { body } = await onionRpc('batch', { requests: [{ method: 'get_swarm', params: { pubkey } }] }, exit)
  const snodes = ((body as { results?: Array<{ body?: { snodes?: SnodeSwarmEntry[] } }> })?.results?.[0]?.body?.snodes) ?? []
  return snodes
    .filter(s => s.ip && s.ip !== '0.0.0.0' && s.pubkey_x25519)
    .map(s => ({ ip: s.ip, port: Number(s.port), x25519: s.pubkey_x25519, ed25519: s.pubkey_ed25519 }))
}

/** Run a single storage_rpc sub-request (store/retrieve/...) through the onion. */
export async function onionSubRequest(
  sub: { method: string; params: Record<string, unknown> },
  exit: Snode,
): Promise<{ code: number; body: Record<string, unknown> }> {
  const { body } = await onionRpc('batch', { requests: [sub] }, exit)
  const result = (body as { results?: Array<{ code: number; body: Record<string, unknown> }> })?.results?.[0]
  if (!result) throw new Error('Empty onion batch response')
  return result
}
