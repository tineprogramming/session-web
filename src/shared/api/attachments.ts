// Apocentro file attachments
//
// Each attachment is encrypted client-side with a per-file random AES-256-GCM
// key (independent of the node-derived onion keys). Only encrypted bytes ever
// reach the proxy / Session file server. The per-file key + SHA-256 digest are
// carried inside the message's AttachmentPointer, which itself travels under
// Session's E2E encryption. See spec §4.

import type { AttachmentPointerWithUrl } from '@/shared/api/messages/visibleMessage/VisibleMessage'

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024 // 10 MB, enforced client-side

const BACKEND = import.meta.env.VITE_BACKEND_URL

const IV_LENGTH = 12 // bytes, AES-GCM nonce

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
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

/**
 * Encrypt a file with a fresh AES-256-GCM key, upload the ciphertext through
 * the proxy, and return both the AttachmentPointer (for the outgoing message)
 * and the original blob (for immediate local display).
 */
export async function encryptAndUploadAttachment(
  file: File
): Promise<{ pointer: AttachmentPointerWithUrl; blob: Blob }> {
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error('Attachment exceeds the 10 MB limit')
  }

  const plaintext = new Uint8Array(await file.arrayBuffer())

  const rawKey = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt'])
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintext)
  )
  // [iv(12)][ciphertext + 16-byte GCM tag]
  const ciphertext = concat(iv, encrypted)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', ciphertext))

  const response = await fetch(BACKEND + '/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: toBase64(ciphertext) }),
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
    key: rawKey,
    digest,
  }

  return { pointer, blob: new Blob([plaintext], { type: pointer.contentType }) }
}

type DownloadablePointer = {
  url?: string | null
  key?: Uint8Array | null
  contentType?: string | null
}

/**
 * Download an encrypted attachment through the proxy and decrypt it with the
 * per-file key from the AttachmentPointer. Returns a displayable Blob.
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

  const ciphertext = fromBase64(json.data)
  const iv = ciphertext.subarray(0, IV_LENGTH)
  const body = ciphertext.subarray(IV_LENGTH)

  const key = pointer.key instanceof Uint8Array ? pointer.key : new Uint8Array(pointer.key)
  const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, body)

  return new Blob([plaintext], { type: pointer.contentType || 'application/octet-stream' })
}

export function isImageAttachment(contentType?: string | null): boolean {
  return !!contentType && contentType.startsWith('image/')
}
