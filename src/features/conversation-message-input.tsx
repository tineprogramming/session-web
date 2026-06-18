import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { MdArrowUpward, MdAttachFile, MdClose, MdMic, MdStop } from 'react-icons/md'
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
import { useLiveQuery } from 'dexie-react-hooks'
import { ConversationType } from '@/shared/api/conversations'
import { fromHexToArray } from '@/shared/api/utils/String'

export function ConversationMessageInput({ conversationID, onSent }: {
  conversationID: string
  onSent: () => void
}) {
  const [message, setMessage] = React.useState('')
  const [attachment, setAttachment] = React.useState<{ pointer: AttachmentPointerWithUrl, blob: Blob } | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [recording, setRecording] = React.useState(false)
  const [recordSeconds, setRecordSeconds] = React.useState(0)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const recordTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const account = useAppSelector(selectAccount)
  const { t } = useTranslation()

  const conversation = useLiveQuery(() => account
    ? db.conversations.get({ sessionID: conversationID, accountSessionID: account.sessionID })
    : undefined,
  [account, conversationID])

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

  const pickAudioMime = (): string => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    for (const m of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
    }
    return ''
  }

  const startRecording = async () => {
    if (recording || uploading) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickAudioMime()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (recordTimerRef.current) clearInterval(recordTimerRef.current)
        setRecording(false)
        setRecordSeconds(0)
        const type = recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type })
        if (blob.size === 0) return
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'
        const file = new File([blob], `voice-message.${ext}`, { type })
        setUploading(true)
        try {
          const uploaded = await encryptAndUploadAttachment(file)
          uploaded.pointer.flags = 1 // AttachmentPointer.Flags.VOICE_MESSAGE
          await handleSendMessage(uploaded)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Voice message failed')
        } finally {
          setUploading(false)
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000)
    } catch {
      toast.error('Microphone access denied')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
  }

  const cancelRecording = () => {
    const r = recorderRef.current
    if (r) { r.onstop = null as never; r.stream.getTracks().forEach(t => t.stop()); r.stop() }
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    setRecording(false)
    setRecordSeconds(0)
  }

  const handleSendMessage = async (override?: { pointer: AttachmentPointerWithUrl, blob: Blob }) => {
    if (!account) return
    if(uploading) return
    const att = override ?? attachment
    if(message !== '' || att) {
      const attachments = att ? [att.pointer] : []
      const dbAttachments: DbAttachment[] | undefined = att ? [{
        contentType: att.pointer.contentType ?? 'application/octet-stream',
        fileName: att.pointer.fileName,
        size: att.pointer.size,
        blob: att.blob,
      }] : undefined
      const timestamp = await getNowWithNetworkOffset()
      const isGroup = conversation?.type === ConversationType.ClosedGroup

      if (isGroup) {
        const memberSessionIDs = conversation.members.map(m => m.sessionID)
        const idBytes = fromHexToArray(conversationID)
        const fullRoster = [account.sessionID, ...memberSessionIDs]
        const groupContext = { id: idBytes, name: conversation.displayName, members: fullRoster, type: 'DELIVER' as const }

        const messageInstance = new VisibleMessage({
          body: message,
          lokiProfile: await UserUtils.getOurProfile(),
          timestamp: timestamp,
          expirationType: 'unknown',
          expireTimer: 0,
          identifier: uuid(),
          attachments: attachments,
          preview: [],
          quote: undefined,
          group: groupContext,
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
          timestamp: timestamp,
          group: groupContext,
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

        let anyOk = false
        for (const member of memberSessionIDs) {
          const r = await sendMessage(member, messageInstance, syncMessage)
          if (r.ok) {
            anyOk = true
            await db.messages_seen.add({
              hash: r.syncHash,
              receivedAt: timestamp,
              accountSessionID: account.sessionID
            })
          }
        }
        await db.messages.update(tempHash, {
          sendingStatus: anyOk ? 'sent' : 'error'
        })
        return
      }

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
      {recording ? (
        <div className='flex items-center w-full px-3 py-3 gap-3'>
          <span className='animate-pulse text-red-500 text-lg leading-none'>●</span>
          <span className='text-sm flex-1'>
            {t('recording')} {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
          </span>
          <button onClick={cancelRecording} title={t('cancel')} className='text-neutral-400 hover:text-white'>
            <MdClose className='w-5 h-5' />
          </button>
          <Button size='icon' variant='secondary' onClick={stopRecording} title={t('send')}>
            <MdArrowUpward />
          </Button>
        </div>
      ) : (
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
          {message.trim() || attachment ? (
            <Button size='icon' variant='secondary' className='mb-2' onClick={() => handleSendMessage()} title={t('send')}>
              <MdArrowUpward />
            </Button>
          ) : (
            <Button size='icon' variant='secondary' className='mb-2' onClick={startRecording} disabled={uploading} title={t('recordVoice')}>
              {uploading ? <ImSpinner2 className='animate-spin' /> : <MdMic />}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}