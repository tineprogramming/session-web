import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { MdArrowUpward, MdAttachFile, MdClose, MdMic } from 'react-icons/md'
import cx from 'classnames'
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
  const [cancelArmed, setCancelArmed] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const recordTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const holdingRef = React.useRef(false)
  const cancelArmedRef = React.useRef(false)
  const cancelledRef = React.useRef(false)
  const pointerStartXRef = React.useRef(0)
  const recordStartTimeRef = React.useRef(0)
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
    cancelledRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickAudioMime()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (recordTimerRef.current) clearInterval(recordTimerRef.current)
        const duration = Date.now() - recordStartTimeRef.current
        setRecording(false)
        setRecordSeconds(0)
        setCancelArmed(false)
        if (cancelledRef.current) return
        if (duration < 700) { toast.message(t('holdToRecord')); return }
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
      recordStartTimeRef.current = Date.now()
      setRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000)
      // If the user already released during getUserMedia, resolve immediately.
      if (!holdingRef.current) {
        if (cancelArmedRef.current) cancelRecording()
        else stopRecording()
      }
    } catch {
      setRecording(false)
      toast.error('Microphone access denied')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
  }

  const cancelRecording = () => {
    cancelledRef.current = true
    recorderRef.current?.stop()
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    setRecording(false)
    setRecordSeconds(0)
    setCancelArmed(false)
  }

  // Press-and-hold the mic to record; release to send, slide left to cancel.
  const handleMicDown = (e: React.PointerEvent) => {
    if (uploading) return
    e.preventDefault()
    holdingRef.current = true
    cancelArmedRef.current = false
    pointerStartXRef.current = e.clientX
    setCancelArmed(false)
    startRecording()
  }

  // Track move/release at the window level so it works regardless of pointer
  // capture (touch and mouse), and even if the finger leaves the button.
  React.useEffect(() => {
    if (!recording) return
    const onMove = (e: PointerEvent) => {
      if (!holdingRef.current) return
      const armed = e.clientX - pointerStartXRef.current < -60
      if (armed !== cancelArmedRef.current) {
        cancelArmedRef.current = armed
        setCancelArmed(armed)
      }
    }
    const onUp = () => {
      if (!holdingRef.current) return
      holdingRef.current = false
      if (cancelArmedRef.current) cancelRecording()
      else stopRecording()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording])

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
      <div className='relative flex items-end w-full pr-2 gap-2'>
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
          <Button
            size='icon'
            variant='secondary'
            className={cx('mb-2 touch-none select-none', recording && (cancelArmed ? 'bg-red-600 text-white scale-110' : 'bg-red-500 text-white scale-110'))}
            disabled={uploading}
            onPointerDown={handleMicDown}
            title={t('recordVoice')}
          >
            {uploading ? <ImSpinner2 className='animate-spin' /> : <MdMic />}
          </Button>
        )}

        {recording && (
          <div className='absolute inset-0 flex items-center gap-3 px-4 bg-background pointer-events-none'>
            <span className='animate-pulse text-red-500 text-lg leading-none'>●</span>
            <span className='text-sm tabular-nums'>
              {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
            </span>
            <span className={cx('flex-1 text-sm', cancelArmed ? 'text-red-500 font-medium' : 'text-neutral-500')}>
              {cancelArmed ? t('releaseToCancel') : t('slideToCancel')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}