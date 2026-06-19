import { LeftPanel, SidebarContent } from '@/widgets/left-panel'
import { ResizablePanel } from '@/shared/ui/resizable'
import { PageWrapper } from '@/widgets/page-wrapper'
import { Outlet, useLocation } from 'react-router-dom'
import { useIsMobile } from '@/shared/hooks/use-is-mobile'

export function MainWrapper() {
  const isMobile = useIsMobile()
  const location = useLocation()

  // On phones use a single column: the conversation list is the home screen,
  // and opening a conversation replaces it full-screen (back button returns).
  if (isMobile) {
    const inConversation = location.pathname.startsWith('/conversation')
    return (
      <div className='flex h-full w-full flex-col overflow-hidden'>
        {inConversation ? <Outlet /> : <SidebarContent />}
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
