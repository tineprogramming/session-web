import logoUrl from '@/assets/apocentro-logo.png'

export function AppLoader() {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center gap-4'>
      <img src={logoUrl} alt='Apocentro' className='h-40 w-40 select-none pointer-events-none animate-pulse' />
      <span className='text-2xl font-semibold tracking-wide select-none pointer-events-none'>Apocentro</span>
      <div className='mt-1 h-1 w-44 overflow-hidden rounded-full bg-neutral-800'>
        <div
          className='h-full w-1/3 rounded-full bg-brand'
          style={{ animation: 'apc-bar 1.1s ease-in-out infinite' }}
        />
      </div>
      <style>{'@keyframes apc-bar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
    </main>
  )
}
