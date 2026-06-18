import { SnodeNamespaces } from '../../../types/namespaces'
import * as SnodeSignature from './snode-signature'
import { Snode } from './onion-crypto'
import { setSnodePool, onionSubRequest } from './onion-request'

export async function fetchSnodesList(): Promise<Snode[]> {
  const snodesResponse = await fetch(import.meta.env.VITE_BACKEND_URL + '/snodes')
    .then(res => res.json() as Promise<{ ok: true, snodes: Snode[] } | { ok: false, error: string }>)
  if (!snodesResponse.ok) throw new Error(snodesResponse.error)
  setSnodePool(snodesResponse.snodes)
  return snodesResponse.snodes
}

/** Retrieve messages from our swarm via a client-side 3-hop onion (spec §3). */
export async function pollSnode({ swarm, namespace, pubkey, lastHash }: {
  swarm: Snode,
  namespace: SnodeNamespaces,
  pubkey: string
  lastHash?: string
}) {
  const sig = await SnodeSignature.getSnodeSignatureParams({
    method: 'retrieve' as const,
    namespace,
    pubkey,
  })
  const result = await onionSubRequest({
    method: 'retrieve',
    params: {
      pubkey,
      namespace,
      last_hash: lastHash ?? '',
      timestamp: sig.timestamp,
      signature: sig.signature,
      pubkey_ed25519: sig.pubkey_ed25519,
    },
  }, swarm)
  // Keep the previous shape so callers can read `.messages.messages`.
  return { code: result.code, messages: result.body }
}
