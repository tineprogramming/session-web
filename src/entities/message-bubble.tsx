import { DbAttachment, DbMessage } from '@/shared/api/storage'
import { isImageAttachment } from '@/shared/api/attachments'
import { resendMessage } from '@/shared/api/resend'
import cx from 'classnames'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ImSpinner2 } from 'react-icons/im'
import { IoIosWarning } from 'react-icons/io'
import { MdFileDownload } from 'react-icons/md'

export function MessageBubble({ msg }: {
  msg: DbMessage
}) {
  const { t } = useTranslation()
  const hasText = !!msg.textContent
  const hasAttachments = !!msg.attachments?.length

  if (msg.system) {
    return (
      <div className='flex justify-center w-full my-1'>
        <span className='text-sm lg:text-[11px] text-muted-foreground bg-neutral-800/60 rounded-full px-3 py-0.5'>
          {msg.textContent}
        </span>
      </div>
    )
  }

  return (
    <div className={cx('flex gap-2 w-full', {
      'justify-start': msg.direction === 'incoming',
      'justify-end': msg.direction === 'outgoing',
    })}>
      <div className={cx('flex w-full max-w-[80%]', {
        'justify-start': msg.direction === 'incoming',
        'justify-end': msg.direction === 'outgoing',
      })}>
        {msg.direction === 'outgoing' && msg.sendingStatus === 'sending' && <span className='animate-spin origin-center w-2 h-2 self-end'><ImSpinner2 className='w-2 h-2' /></span>}
        {msg.direction === 'outgoing' && msg.sendingStatus === 'error' && (
          <button
            type='button'
            onClick={() => resendMessage(msg)}
            title={t('tapToResend')}
            className='w-4 h-4 self-end text-orange-600 hover:text-orange-500 cursor-pointer'
          >
            <IoIosWarning className='w-4 h-4' />
          </button>
        )}
        <div className={cx('px-3 py-[6px] rounded-2xl break-words w-fit max-w-[min(430px,100%)]', {
          'bg-conversation-bubble': msg.direction === 'incoming',
          'bg-brand text-black': msg.direction === 'outgoing',
        })}>
          {msg.senderID && msg.direction === 'incoming' && (
            <div className='text-muted-foreground text-xs lg:text-[10px] leading-3 pt-0.5'>
              {msg.senderID.slice(0, 6)}...{msg.senderID.slice(-4)}
            </div>
          )}
          {hasAttachments && (
            <div className='flex flex-col gap-1 pt-1'>
              {msg.attachments!.map((attachment, i) => (
                <Attachment key={i} attachment={attachment} direction={msg.direction} />
              ))}
            </div>
          )}
          {(hasText || !hasAttachments) && (
            <div className='text-base leading-snug lg:text-[13px] lg:leading-4 font-normal whitespace-pre-wrap'>{msg.textContent} <Timestamp
              timestamp={msg.timestamp}
              className={msg.direction === 'incoming' ? 'text-muted-foreground' : 'text-green-700'}
            /></div>
          )}
        </div>
      </div>
    </div>
  )
}

function Attachment({ attachment, direction }: {
  attachment: DbAttachment
  direction: 'incoming' | 'outgoing'
}) {
  const url = React.useMemo(() => URL.createObjectURL(attachment.blob), [attachment.blob])
  React.useEffect(() => () => URL.revokeObjectURL(url), [url])

  if (isImageAttachment(attachment.contentType)) {
    return (
      <a href={url} target='_blank' rel='noreferrer'>
        <img
          src={url}
          alt={attachment.fileName ?? 'image'}
          className='rounded-lg max-h-64 max-w-full object-contain'
        />
      </a>
    )
  }

  if (attachment.contentType?.startsWith('audio/')) {
    return <audio controls src={url} className='max-w-[260px] h-10' />
  }

  return (
    <a
      href={url}
      download={attachment.fileName ?? 'file'}
      className={cx('flex items-center gap-2 text-base lg:text-[13px] underline-offset-2 hover:underline py-1', {
        'text-black': direction === 'outgoing',
      })}
    >
      <MdFileDownload className='shrink-0' />
      <span className='truncate max-w-[260px]'>{attachment.fileName ?? 'Download file'}</span>
    </a>
  )
}

function Timestamp({ timestamp, className }: {
  timestamp: number
  className: string
}) {
  return (
    <span className={cx('text-xs lg:text-[11px] pointer-events-none select-none ml-2 float-right mt-[2px]', className)}>
      {Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      }).format(timestamp)}
    </span>
  )
}
