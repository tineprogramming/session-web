import React from 'react'
import logoUrl from '@/assets/apocentro-logo.png'
import { getLoadProgress, onLoadProgress } from '@/shared/load-progress'

export function AppLoader() {
  const [progress, setProgress] = React.useState(getLoadProgress)
  React.useEffect(() => onLoadProgress(setProgress), [])

  return (
    <main className='flex min-h-screen flex-col items-center justify-center gap-4'>
      <img src={logoUrl} alt='Apocentro' className='h-40 w-40 select-none pointer-events-none' />
      <span className='text-2xl font-semibold tracking-wide select-none pointer-events-none'>Apocentro</span>
      <div className='mt-1 h-1 w-44 overflow-hidden rounded-full bg-neutral-800'>
        <div
          className='h-full rounded-full bg-brand transition-[width] duration-300 ease-out'
          style={{ width: `${Math.max(5, progress)}%` }}
        />
      </div>
    </main>
  )
}
