// Apocentro file attachments
//
// Uses Session's STANDARD attachment encryption so files interoperate with the
// Apocentro mobile app: AES-256-CBC + HMAC-SHA256 with a 64-byte key
// (32 bytes AES + 32 bytes HMAC). The encrypted blob is `iv(16) || ciphertext ||
// hmac(32)` and the digest is SHA-256 of that blob. Only encrypted bytes ever
// reach the proxy / Session file server. See Session AttachmentCrypto.

import type { AttachmentPointerWithUrl } from '@/shared/api/messages/visibleMessage/VisibleMessage'

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024 // 10 MB, enforced client-side

const BACKEND = import.meta.env.VITE_BACKEND_URL

const KEY_LENGTH = 64 // 32-byte AES-CBC key + 32-byte HMAC key
const IV_LENGTH = 16
const MAC_LENGTH = 32

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function aesCbcEncrypt(aesKey: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-CBC' }, false, ['encrypt'])
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, data))
}

async function aesCbcDecrypt(aesKey: Uint8Array, iv: Uint8Array, ct: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-CBC' }, false, ['decrypt'])
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ct))
}

async function hmacSha256(macKey: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', macKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data))
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
}

/**
 * Encrypt a file with Session's attachment scheme, upload the ciphertext through
 * the proxy, and return the AttachmentPointer (for the outgoing message) plus
 * the original blob (for immediate local display).
 */
export async function encryptAndUploadAttachment(
  file: File
): Promise<{ pointer: AttachmentPointerWithUrl; blob: Blob }> {
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error('Attachment exceeds the 10 MB limit')
  }

  const plaintext = new Uint8Array(await file.arrayBuffer())

  const keys = crypto.getRandomValues(new Uint8Array(KEY_LENGTH))
  const aesKey = keys.subarray(0, 32)
  const macKey = keys.subarray(32, 64)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const ciphertext = await aesCbcEncrypt(aesKey, iv, plaintext)
  const ivAndCiphertext = concat(iv, ciphertext)
  const mac = await hmacSha256(macKey, ivAndCiphertext)
  const encrypted = concat(ivAndCiphertext, mac) // iv || ct || hmac
  const digest = await sha256(encrypted)

  const response = await fetch(BACKEND + '/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: toBase64(encrypted) }),
  })
  const json = (await response.json()) as
    | { ok: true; id: string; url: string }
    | { ok: false; error?: string }
  if (!response.ok || !json.ok) {
    throw new Error(('error' in json && json.error) || 'Attachment upload failed')
  }

  const pointer: AttachmentPointerWithUrl = {
    url: json.url,
    id: Number(json.id) || 0,
    contentType: file.type || 'application/octet-stream',
    fileName: file.name,
    size: file.size,
    key: keys,
    digest,
  }

  return { pointer, blob: new Blob([plaintext], { type: pointer.contentType }) }
}

type DownloadablePointer = {
  url?: string | null
  key?: Uint8Array | null
  digest?: Uint8Array | null
  contentType?: string | null
}

/**
 * Download an attachment through the proxy and decrypt it with Session's
 * attachment scheme (AES-256-CBC + HMAC-SHA256). Returns a displayable Blob.
 */
export async function downloadAndDecryptAttachment(pointer: DownloadablePointer): Promise<Blob> {
  if (!pointer.url || !pointer.key) {
    throw new Error('Attachment pointer is missing url or key')
  }

  const response = await fetch(BACKEND + '/download?' + new URLSearchParams({ url: pointer.url }))
  const json = (await response.json()) as { ok: true; data: string } | { ok: false; error?: string }
  if (!response.ok || !json.ok) {
    throw new Error(('error' in json && json.error) || 'Attachment download failed')
  }

  const encrypted = fromBase64(json.data)
  const keys = pointer.key instanceof Uint8Array ? pointer.key : new Uint8Array(pointer.key)
  if (keys.length < KEY_LENGTH) throw new Error('Attachment key has unexpected length')
  const aesKey = keys.subarray(0, 32)
  const macKey = keys.subarray(32, 64)

  if (encrypted.length < IV_LENGTH + MAC_LENGTH) throw new Error('Attachment too short')
  const ivAndCiphertext = encrypted.subarray(0, encrypted.length - MAC_LENGTH)
  const mac = encrypted.subarray(encrypted.length - MAC_LENGTH)

  const expectedMac = await hmacSha256(macKey, ivAndCiphertext)
  if (!timingSafeEqual(expectedMac, mac)) throw new Error('Attachment HMAC mismatch')

  const iv = ivAndCiphertext.subarray(0, IV_LENGTH)
  const ciphertext = ivAndCiphertext.subarray(IV_LENGTH)
  const plaintext = await aesCbcDecrypt(aesKey, iv, ciphertext)

  return new Blob([plaintext], { type: pointer.contentType || 'application/octet-stream' })
}

export function isImageAttachment(contentType?: string | null): boolean {
  return !!contentType && contentType.startsWith('image/')
}
