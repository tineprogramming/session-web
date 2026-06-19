import * as React from 'react'
import cx from 'classnames'
import {
  ResizableHandle,
  ResizablePanel,
} from '@/shared/ui/resizable'
import { Separator } from '@/shared/ui/separator'
import { AccountSwitcher } from '@/features/account-switcher'
import { ConversationsList } from '@/features/conversations-list'
import { CreateConversationButton } from '@/entities/create-conversation-button'
import { PathDisplay } from '@/widgets/path-display'

/** The sidebar's inner content, reused full-width on mobile (no resizable). */
export function SidebarContent({ isCollapsed = false }: { isCollapsed?: boolean }) {
  return (
    <>
      <div
        className={cx(
          'flex h-[56px] items-center justify-center shrink-0 gap-1 px-2',
          isCollapsed ? 'h-[52px]' : ''
        )}
      >
        <AccountSwitcher isCollapsed={isCollapsed} />
        {!isCollapsed && (
          <CreateConversationButton className='shrink-0' />
        )}
      </div>
      <Separator />
      <ConversationsList isCollapsed={isCollapsed} />
      {!isCollapsed && (
        <>
          <Separator />
          <PathDisplay />
        </>
      )}
    </>
  )
}

export function LeftPanel() {
  const [isCollapsed, setIsCollapsed] = React.useState(false)

  return (
    <>
      <ResizablePanel
        defaultSize={25}
        collapsedSize={4}
        collapsible={true}
        minSize={15}
        maxSize={30}
        onCollapse={() => setIsCollapsed(true)}
        onExpand={() => setIsCollapsed(false)}
        className={cx('flex flex-col', {
          'min-w-[52px] max-w-[52px]': isCollapsed,
          'min-w-[200px]': !isCollapsed,
        })}
      >
        <SidebarContent isCollapsed={isCollapsed} />
      </ResizablePanel>
      <ResizableHandle withHandle />
    </>
  )
}
