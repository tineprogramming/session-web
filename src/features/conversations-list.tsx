import React from 'react'
import { Button, buttonVariants } from '@/shared/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/ui/tooltip'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { DbConversation, db } from '@/shared/api/storage'
import cx from 'classnames'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar'
import { ConversationType } from '@/shared/api/conversations'
import { useAppSelector } from '@/shared/store/hooks'
import { selectAccount } from '@/shared/store/slices/account'
import { useTranslation } from 'react-i18next'
import { CounterBadge } from '@/shared/ui/counter-badge'
import { ConversationPreviewMessage } from '@/entities/conversation-preview-message'
import { CreateConversationButton } from '@/entities/create-conversation-button'

export function ConversationsList({ isCollapsed }: {
  isCollapsed: boolean
}) {
  const account = useAppSelector(selectAccount)
  const conversations = useLiveQuery(() => account ? db.conversations.where({ accountSessionID: account.sessionID }).toArray() : [], [account])
  const params = useParams<{ id: string }>()
  const pathname = useLocation().pathname
  const { t } = useTranslation()

  const selectedConvo: DbConversation | null = React.useMemo(() => {
    if (!conversations) return null
    if (pathname.startsWith('/conversation')) {
      return conversations?.find(convo => convo.sessionID === params.id) || null
    }
    return null
  }, [params.id, conversations, pathname])

  return (
    <div
      data-collapsed={isCollapsed}
      className="group flex flex-col gap-4 py-2 data-[collapsed=true]:py-2 flex-1"
    >
      <nav className={cx('gap-1 px-2 group-[[data-collapsed=true]]:px-2 flex flex-col', {
        'h-full flex': conversations && conversations.length === 0,
        'items-center justify-center': conversations && conversations.length === 0 && !isCollapsed,
      })}>
        {conversations !== undefined && (
          conversations.length ? (
            conversations.map(convo =>
              <ConversationItem
                key={convo.id}
                selected={selectedConvo ? convo.id === selectedConvo.id : false}
                convo={convo}
                isCollapsed={isCollapsed}
              />
            )
          ) : (
            isCollapsed ? (
              <CreateConversationButton className='w-full' />
            ) : (
              <p className="text-muted-foreground text-center">
                {t('noConversations')}
              </p>
            )
          )
        )}
      </nav>
    </div>
  )
}

function ConversationItem({ selected, convo, isCollapsed }: {
  selected: boolean
  convo: DbConversation
  isCollapsed: boolean
}) {
  const account = useAppSelector(selectAccount)
  const newMessages = useLiveQuery(() => account
    ? db.messages.where({ conversationID: convo.sessionID, accountSessionID: account.sessionID, read: Number(false) as 0 | 1 }).count()
    : 0,
    [convo.sessionID]
  )

  const variant = selected ? 'default' : 'ghost'

  const displayImage = React.useMemo(() => {
    if(convo.displayImage) {
      return URL.createObjectURL(convo.displayImage)
    }
  }, [convo.displayImage])

  const trimmedDisplayName = React.useMemo(() => {
    if(convo.displayName) {
      const words = convo.displayName.split(' ')
      if (words.length > 1) {
        return words[0][0] + words[1][0]
      } else {
        return convo.displayName.slice(0, 2)
      }
    } else {
      if(convo.type === ConversationType.DirectMessages) {
        return convo.sessionID.slice(2, 4)
      } else {
        return convo.sessionID.slice(0, 2)
      }
    }
  }, [convo])

  return (
    isCollapsed ? (
      <Tooltip key={convo.id} delayDuration={0}>
        <TooltipTrigger asChild>
          <Link
            to={`/conversation/${convo.sessionID}`}
            className={cx('relative',
              buttonVariants({ variant: variant, size: 'icon' }),
              'h-9 w-9',
              variant === 'default' &&
              'dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-white'
            )}
          >
            {newMessages !== undefined && newMessages > 0 && <CounterBadge>{newMessages}</CounterBadge>}
            <Avatar className='w-[24px] h-[24px] text-neutral-400 font-semibold text-xs'>
              {displayImage && <AvatarImage src={displayImage} alt={convo.displayName} />}
              <AvatarFallback>{trimmedDisplayName.toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="sr-only">{convo.displayName || convo.sessionID}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-4">
          {convo.displayName || convo.sessionID}
          {newMessages !== undefined && newMessages > 0 && (
            <span className="ml-auto text-muted-foreground">
              {newMessages}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    ) : (
      <Link
        to={`/conversation/${convo.sessionID}`}
        className={cx('max-w-full',
          buttonVariants({ variant: variant, size: 'sm' }),
          variant === 'default' &&
          'lg:dark:bg-muted lg:dark:text-white lg:dark:hover:bg-muted lg:dark:hover:text-white',
          '!justify-start gap-3 !text-base lg:!text-sm h-fit py-3 lg:py-2',
          // Mobile (B design): each row is a rounded card; desktop stays flat.
          'mx-2 my-1 rounded-2xl border bg-[#16161a] px-3 lg:mx-0 lg:my-0 lg:rounded-md lg:border-0 lg:bg-transparent lg:px-3',
          variant === 'default' ? 'border-brand/50' : 'border-[#23232b]'
        )}
      >
        <Avatar className='w-[56px] h-[56px] lg:w-[48px] lg:h-[48px] shrink-0 text-neutral-400 font-semibold text-lg lg:text-base'>
          {displayImage && <AvatarImage src={displayImage} alt={convo.displayName || convo.sessionID} />}
          <AvatarFallback>{trimmedDisplayName.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className='flex flex-col gap-0.5 flex-1 min-w-0'>
          <span className='text-lg lg:text-base font-semibold text-ellipsis overflow-hidden'>{convo.displayName || convo.sessionID}</span>
          {convo.lastMessage && (<span className='font-normal text-sm text-muted-foreground text-ellipsis overflow-hidden'>
            <ConversationPreviewMessage message={convo.lastMessage} />
          </span>)}
        </div>
        {newMessages !== undefined && newMessages > 0 && (
          <span
            className={cx('bg-brand rounded-full w-5 h-5 lg:w-4 lg:h-4 flex items-center justify-center text-xs !text-black shrink-0',
              'ml-auto'
            )}
          >
            {newMessages}
          </span>
        )}
      </Link>
    )
  )
}