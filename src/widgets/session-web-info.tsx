import logoUrl from '@/assets/apocentro-logo.png'

export function SessionWebInfo() {
  return (
    <div className='flex flex-col justify-center items-center h-full gap-2'>
      <img src={logoUrl} alt='Apocentro' className='w-24 h-24 select-none pointer-events-none' />
      <h1 className='text-4xl color-white font-semibold select-none pointer-events-none'>Apocentro</h1>
      <span className='text-muted-foreground text-sm'>Private encrypted messaging</span>
      <span className='text-muted-foreground'>v{import.meta.env.VITE_GIT_COMMIT_HASH?.slice(0, 7) ?? '0.0.1'}</span>
    </div>
  )
}
