import { LeftPanel, SidebarContent } from '@/widgets/left-panel'
import { ResizablePanel } from '@/shared/ui/resizable'
import { PageWrapper } from '@/widgets/page-wrapper'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useIsMobile } from '@/shared/hooks/use-is-mobile'
import { SquarePenIcon } from 'lucide-react'

export function MainWrapper() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const navigate = useNavigate()

  // Phones: single column. The conversation list is the home screen; opening a
  // conversation replaces it full-screen. Compose lives in a thumb-reachable FAB.
  if (isMobile) {
    const inConversation = location.pathname.startsWith('/conversation')
    return (
      <div className='relative flex h-full w-full flex-col overflow-hidden'>
        {inConversation ? <Outlet /> : <SidebarContent />}
        {!inConversation && (
          <button
            onClick={() => navigate('/conversation/new')}
            title='New conversation'
            className='absolute bottom-6 right-5 z-20 w-16 h-16 rounded-full bg-brand text-black shadow-xl shadow-black/40 flex items-center justify-center active:scale-95 transition-transform'
          >
            <SquarePenIcon size={26} />
          </button>
        )}
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
