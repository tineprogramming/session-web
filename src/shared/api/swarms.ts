import { Snode } from '@/shared/api/onion-crypto'
import { onionGetSwarm } from '@/shared/api/onion-request'
import { ensureSnodePool } from '@/shared/nodes'

/** Look up a pubkey's swarm through a client-side onion (spec §3). */
export async function fetchSwarmsFor(pubkey: string): Promise<Snode[]> {
  await ensureSnodePool()
  return onionGetSwarm(pubkey)
}
