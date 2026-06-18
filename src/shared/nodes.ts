import { fetchSnodesList } from '@/shared/api/snodes'
import { fetchSwarmsFor } from '@/shared/api/swarms'
import { getIdentityKeyPair } from '@/shared/api/storage'
import { toHex } from '@/shared/api/utils/String'
import { Snode } from '@/shared/api/onion-crypto'
import { getSnodePool } from '@/shared/api/onion-request'
import _ from 'lodash'
import { toast } from 'sonner'

let targetSwarm: Snode | undefined

/** Make sure the snode pool (with pubkeys) is loaded for onion routing. */
export async function ensureSnodePool(): Promise<Snode[]> {
  let pool = getSnodePool()
  if (pool.length === 0) {
    pool = await fetchSnodesList()
    if (pool.length === 0) {
      toast.error('No snodes available')
      throw new Error('No snodes available')
    }
  }
  return pool
}

/** A random snode from the pool (e.g. for non-swarm onion requests). */
export async function getRandomSnode(): Promise<Snode> {
  const pool = await ensureSnodePool()
  return _.sample(pool) as Snode
}

/** Our own swarm exit node, used for polling our messages. */
export async function getTargetSwarm(): Promise<Snode> {
  const keypair = getIdentityKeyPair()
  if (!keypair) throw new Error('No identity keypair found')
  if (!targetSwarm) {
    const swarms = await fetchSwarmsFor(toHex(keypair.pubKey))
    if (swarms.length === 0) {
      toast.error('No swarms available')
      throw new Error('No swarms available')
    }
    targetSwarm = _.sample(swarms) as Snode
  }
  return targetSwarm
}

export function setTargetSwarm(newTargetSwarm: Snode) {
  targetSwarm = newTargetSwarm
}

export function resetTargetSwarm() {
  targetSwarm = undefined
}

// Kept for API compatibility with existing reset calls.
export function resetTargetNode() {
  // snode pool is managed in onion-request; nothing to reset here
}
