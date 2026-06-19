// Loader for the official Session Foundation libsession-util WASM, used to
// implement real Session closed groups (groups v2) that interoperate with the
// Apocentro/Session mobile app. The module is heavy (~1.7 MB wasm) so it is
// loaded lazily and cached, only when a groups-v2 feature is first used.

import factory from '@session-foundation/libsession-wasm'
import wasmUrl from '@session-foundation/libsession-wasm/wasm?url'
import type { MainModule } from '@session-foundation/libsession-wasm'

let modulePromise: Promise<MainModule> | undefined

export function getLibsession(): Promise<MainModule> {
  if (!modulePromise) {
    modulePromise = factory({ locateFile: () => wasmUrl } as unknown as undefined)
      .catch(err => { modulePromise = undefined; throw err })
  }
  return modulePromise
}

/** Session groups v2 swarm namespaces (from libsession). */
export const GroupNamespace = {
  Messages: 11,
  Keys: 12,
  Info: 13,
  Members: 14,
} as const
