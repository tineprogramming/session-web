import SessionLogo from '@/assets/session-logo.svg?react'

export function SessionWebInfo() {
  return (
    <div className='flex flex-col justify-center items-center h-full gap-2'>
      <SessionLogo className='w-24 h-24' />
      <h1 className='text-4xl color-white font-semibold select-none pointer-events-none'>Session Web</h1>
      {/* <a className='text-muted-foreground hover:underline underline-offset-2' target='_blank' rel='nofollow noreferrer'></a> */}
      <a href='https://github.com/gongchandang49/session-web' className='color-brand hover:underline underline-offset-2' target='_blank' rel='nofollow noreferrer'>Published on GitHub</a>
      <span className='text-muted-foreground'>v{import.meta.env.VITE_GIT_COMMIT_HASH.slice(0, 7)}</span>
    </div>
  )
}