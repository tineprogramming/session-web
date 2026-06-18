import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { MdArrowUpward, MdAttachFile, MdClose } from 'react-icons/md'
import { ImSpinner2 } from 'react-icons/im'
import TextareaAutosize from 'react-textarea-autosize'
import { sendMessage } from '@/shared/api/messages-sender'
import { VisibleMessage } from '@/shared/api/messages/visibleMessage/VisibleMessage'
import type { AttachmentPointerWithUrl } from '@/shared/api/messages/visibleMessage/VisibleMessage'
import * as UserUtils from '@/shared/api/utils/User'
import { getNowWithNetworkOffset } from '@/shared/api/get-network-time'
import { v4 as uuid } from 'uuid'
import { db, DbAttachment } from '@/shared/api/storage'
import { useAppSelector } from '@/shared/store/hooks'
import { selectAccount } from '@/shared/store/slices/account'
import { encryptAndUploadAttachment, MAX_ATTACHMENT_SIZE } from '@/shared/api/attachments'
import { toast } from 'sonner'

export function ConversationMessageInput({ conversationID, onSent }: {
  conversationID: string
  onSent: () => void
}) {
  const [message, setMessage] = React.useState('')
  const [attachment, setAttachment] = React.useState<{ pointer: AttachmentPointerWithUrl, blob: Blob } | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const account = useAppSelector(selectAccount)
  const { t } = useTranslation()

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if(e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_ATTACHMENT_SIZE) {
      toast.error('Attachment exceeds the 10 MB limit')
      return
    }
    setUploading(true)
    try {
      const uploaded = await encryptAndUploadAttachment(file)
      setAttachment(uploaded)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Attachment upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!account) return
    if(uploading) return
    if(message !== '' || attachment) {
      const attachments = attachment ? [attachment.pointer] : []
      const dbAttachments: DbAttachment[] | undefined = attachment ? [{
        contentType: attachment.pointer.contentType ?? 'application/octet-stream',
        fileName: attachment.pointer.fileName,
        size: attachment.pointer.size,
        blob: attachment.blob,
      }] : undefined
      const timestamp = await getNowWithNetworkOffset()
      const messageInstance = new VisibleMessage({
        body: message,
        lokiProfile: await UserUtils.getOurProfile(),
        timestamp: timestamp,
        expirationType: 'unknown',
        expireTimer: 0,
        identifier: uuid(),
        attachments: attachments,
        preview: [],
        quote: undefined
      })
      const syncMessage = new VisibleMessage({
        attachments: attachments,
        body: message,
        expirationType: 'unknown',
        expireTimer: 0,
        identifier: uuid(),
        preview: [],
        lokiProfile: undefined,
        quote: undefined,
        reaction: undefined,
        syncTarget: conversationID,
        timestamp: timestamp
      })
      const tempHash = 'temp-unsent-message_' + uuid()
      await db.messages.add({
        direction: 'outgoing',
        conversationID,
        hash: tempHash,
        accountSessionID: account.sessionID,
        textContent: message,
        attachments: dbAttachments,
        read: Number(true) as 0 | 1,
        timestamp,
        sendingStatus: 'sending',
        id: messageInstance.identifier
      })
      setMessage('')
      setAttachment(null)
      onSent()

      const result = await sendMessage(conversationID, messageInstance, syncMessage)
      if (result.ok) {
        await db.messages.update(tempHash, {
          ...(result.ok && { hash: result.syncHash }),
          sendingStatus: result.ok ? 'sent' : 'error'
        })
        await db.messages_seen.add({
          hash: result.syncHash,
          receivedAt: timestamp,
          accountSessionID: account.sessionID
        })
      }
    }
  }

  return (
    <div className='flex flex-col w-full bg-background border border-t-neutral-800 border-x-0 border-b-0'>
      {attachment && (
        <div className='flex items-center gap-2 px-3 pt-2'>
          <div className='flex items-center gap-2 bg-neutral-800 rounded-lg px-2 py-1 text-xs max-w-full'>
            <span className='truncate max-w-[200px]'>{attachment.pointer.fileName ?? 'attachment'}</span>
            <button onClick={() => setAttachment(null)} className='text-neutral-400 hover:text-white shrink-0'>
              <MdClose />
            </button>
          </div>
        </div>
      )}
      <div className='flex items-end w-full pr-2 gap-2'>
        <input
          ref={fileInputRef}
          type='file'
          className='hidden'
          onChange={handleFileSelected}
        />
        <Button
          size='icon'
          variant='ghost'
          className='mb-2 ml-1 shrink-0'
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <ImSpinner2 className='animate-spin' /> : <MdAttachFile />}
        </Button>
        <TextareaAutosize
          placeholder={t('typeMessagePlaceholder')}
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          minRows={1}
          maxRows={5}
          className='rounded-none outline-none flex-1 min-w-0 p-4 placeholder:text-neutral-500 text-sm bg-none resize-none transition-[height] [&::-webkit-scrollbar]:hidden h-[52px]'
        />
        <Button
          size='icon'
          variant='secondary'
          className='mb-2'
          onClick={handleSendMessage}
        >
          <MdArrowUpward />
        </Button>
      </div>
    </div>
  )
}