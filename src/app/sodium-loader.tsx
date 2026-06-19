import React from 'react'
import { setLoadProgress } from '@/shared/load-progress'

export const SodiumLoader = React.lazy(async () => {
  const sodium = await import('libsodium-wrappers-sumo')
  await sodium.ready
  setLoadProgress(45)

  return {
    default: ({ children }: React.PropsWithChildren) => children
  }
})