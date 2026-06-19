import { LeftPanel } from '@/widgets/left-panel'
import { ResizablePanel } from '@/shared/ui/resizable'
import { PageWrapper } from '@/widgets/page-wrapper'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useIsMobile } from '@/shared/hooks/use-is-mobile'
import { BottomNav } from '@/widgets/bottom-nav'
import { ConversationsList } from '@/features/conversations-list'
import { Avatar, AvatarFallback } from '@/shared/ui/avatar'
import { useAppSelector } from '@/shared/store/hooks'
import { selectAccount } from '@/shared/store/slices/account'
import { SquarePenIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** The Chats tab on mobile: branded header + conversation list. */
function MobileChats() {
  const account = useAppSelector(selectAccount)
  const navigate = useNavigate()
  const { t } = useTranslation()
  const initials = (account?.displayName?.slice(0, 2) || account?.sessionID.slice(2, 4) || '').toUpperCase()
  return (
    <div className='flex flex-col h-full'>
      <header className='h-16 flex items-center justify-between px-4 shrink-0 bg-gradient-to-b from-[#11271c] to-transparent'>
        <h1 className='text-2xl font-extrabold'>{t('chats')}</h1>
        <button onClick={() => navigate('/settings')} title={t('settings')}>
          <Avatar className='w-9 h-9 text-neutral-300 font-semibold text-sm border border-neutral-700'>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </header>
      <ConversationsList isCollapsed={false} />
    </div>
  )
}

export function MainWrapper() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const navigate = useNavigate()

  if (isMobile) {
    const path = location.pathname
    // Full-screen conversation (no bottom nav).
    if (path.startsWith('/conversation')) {
      return <div className='h-full w-full'><Outlet /></div>
    }
    const isChats = path === '/'
    return (
      <div className='relative flex h-full w-full flex-col overflow-hidden'>
        <div className='flex-1 min-h-0 overflow-hidden'>
          {isChats ? <MobileChats /> : <Outlet />}
        </div>
        {isChats && (
          <button
            onClick={() => navigate('/conversation/new')}
            title='New conversation'
            className='absolute bottom-[84px] right-5 z-20 w-16 h-16 rounded-full bg-brand text-black shadow-xl shadow-black/40 flex items-center justify-center active:scale-95 transition-transform'
          >
            <SquarePenIcon size={26} />
          </button>
        )}
        <BottomNav />
      </div>
    )
  }

  return (
    <PageWrapper>
      <LeftPanel />
      <ResizablePanel>
        <Outlet />
      </ResizablePanel>
    </PageWrapper>
  )
}
