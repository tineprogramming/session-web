// Apocentro client-side onion routing — per-layer cryptography (spec §3.3).
//
// Each layer: X25519 ECDH (libsodium) -> HMAC-SHA256("LOKI") key derivation
// (WebCrypto) -> AES-256-GCM (WebCrypto). The browser builds the full 3-layer
// onion; the backend only blindly forwards the outer bytes to the guard node.

import sodium from 'libsodium-wrappers-sumo'

export type Snode = {
  ip: string
  port: number
  x25519: string // pubkey_x25519 (hex)
  ed25519: string // pubkey_ed25519 (hex)
}

export type LayerContext = {
  ciphertext: Uint8Array // [iv(12)][ciphertext + 16-byte GCM tag]
  ephemeralKey: Uint8Array // 32-byte X25519 public key
  symmetricKey: Uint8Array // 32 bytes, retained to decrypt the response
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

export function bytesToHex(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0')
  return s
}

export function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}

/** 4-byte little-endian uint32. */
export function uint32LE(n: number): Uint8Array {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n, true)
  return b
}

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacSha256(keyBytes: Uint8Array, dataBytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes)
  return new Uint8Array(sig)
}

/** AES-256-GCM encrypt -> [iv(12)][ciphertext + 16-byte tag]. */
async function aesGcmEncrypt(symKey: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey('raw', symKey, 'AES-GCM', false, ['encrypt'])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  return concatBytes(iv, ct)
}

/** AES-256-GCM decrypt of [iv(12)][ciphertext + 16-byte tag]. */
export async function aesGcmDecrypt(symKey: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const iv = data.subarray(0, 12)
  const body = data.subarray(12)
  const key = await crypto.subtle.importKey('raw', symKey, 'AES-GCM', false, ['decrypt'])
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body))
}

/**
 * Encrypt `plaintext` for one node (one onion layer).
 * Derives the symmetric key as HMAC-SHA256(key="LOKI", data=ECDH(ephemeral, node)).
 */
export async function encryptForNode(nodeX25519Hex: string, plaintext: Uint8Array): Promise<LayerContext> {
  await sodium.ready
  const ephemeral = sodium.crypto_box_keypair()
  const sharedPoint = sodium.crypto_scalarmult(ephemeral.privateKey, hexToBytes(nodeX25519Hex))
  const symmetricKey = await hmacSha256(new TextEncoder().encode('LOKI'), sharedPoint)
  const ciphertext = await aesGcmEncrypt(symmetricKey, plaintext)
  return { ciphertext, ephemeralKey: ephemeral.publicKey, symmetricKey }
}

/**
 * One onion layer's plaintext: [4-byte LE len(inner)][inner ciphertext][JSON metadata].
 */
export function encodeLayer(innerCiphertext: Uint8Array, metadata: object): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(metadata))
  return concatBytes(uint32LE(innerCiphertext.length), innerCiphertext, json)
}
