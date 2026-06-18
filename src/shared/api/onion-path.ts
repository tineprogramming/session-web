// Apocentro onion path (spec §3.9)
//
// The onion routing itself is performed by the proxy, which relays each storage
// request through a 3-hop path (guard -> middle -> swarm exit) so that message
// content and destination are hidden from the proxy. This module fetches the
// current path for live display in the UI.

const BACKEND = import.meta.env.VITE_BACKEND_URL

export type OnionHop = {
  label: string
  ip: string
  port: number
  country: string | null
  countryCode: string | null
}

export async function fetchOnionPath(): Promise<OnionHop[]> {
  const response = await fetch(BACKEND + '/path')
  const json = (await response.json()) as { ok: true; path: OnionHop[] } | { ok: false; error?: string }
  if (!response.ok || !json.ok) {
    throw new Error(('error' in json && json.error) || 'Failed to fetch onion path')
  }
  return json.path
}

/** Convert an ISO 3166-1 alpha-2 country code to its flag emoji. */
export function countryFlag(countryCode: string | null): string {
  if (!countryCode || countryCode.length !== 2) return '🌐'
  const A = 0x1f1e6
  const code = countryCode.toUpperCase()
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65)) + String.fromCodePoint(A + (code.charCodeAt(1) - 65))
}
