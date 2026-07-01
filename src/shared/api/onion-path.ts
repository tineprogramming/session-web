// Apocentro onion path display (spec §3.9).
//
// With client-side onion routing the browser knows the real hops it uses
// (getLastOnionPath). This module resolves GeoIP for those hops plus the
// client's own IP via the backend's best-effort /geoip endpoint.

const BACKEND = import.meta.env.VITE_BACKEND_URL

export type GeoInfo = { ip: string; country: string | null; countryCode: string | null }

export async function fetchGeoip(ips: string[]): Promise<{
  client: GeoInfo | null
  geo: Record<string, { country: string | null; countryCode: string | null }>
}> {
  const response = await fetch(BACKEND + '/geoip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ips }),
  })
  const json = (await response.json()) as
    | { ok: true; client: GeoInfo | null; geo: Record<string, { country: string | null; countryCode: string | null }> }
    | { ok: false; error?: string }
  if (!response.ok || !json.ok) throw new Error(('error' in json && json.error) || 'Failed to fetch geoip')
  return { client: json.client, geo: json.geo }
}

/** Convert an ISO 3166-1 alpha-2 country code to its flag emoji. */
export function countryFlag(countryCode: string | null): string {
  if (!countryCode || countryCode.length !== 2) return '🌐'
  const A = 0x1f1e6
  const code = countryCode.toUpperCase()
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65)) + String.fromCodePoint(A + (code.charCodeAt(1) - 65))
}
