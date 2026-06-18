import logoUrl from '@/assets/apocentro-logo.png'

export function AppLoader() {

  return (
    <main className='flex min-h-screen items-center justify-center'>
      <img src={logoUrl} alt='Apocentro' className='h-48 w-48 animate-pulse select-none pointer-events-none' />
    </main>
  )
}
