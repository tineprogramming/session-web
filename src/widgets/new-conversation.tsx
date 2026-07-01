import React from 'react'
import { TextField } from '@/shared/ui/text-field'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { ArrowRight, X } from 'lucide-react'
import { toast } from 'sonner'
import { decryptONSValue, generateOnsHash } from '@/shared/api/ons'
import { db } from '@/shared/api/storage'
import { useAppSelector } from '@/shared/store/hooks'
import { selectAccount } from '@/shared/store/slices/account'
import { ConversationType } from '@/shared/api/conversations'
import { useNavigate } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { toHex } from '@/shared/api/utils/String'
import { VisibleMessage } from '@/shared/api/messages/visibleMessage/VisibleMessage'
import { sendMessage } from '@/shared/api/messages-sender'
import * as UserUtils from '@/shared/api/utils/User'
import { getNowWithNetworkOffset } from '@/shared/api/get-network-time'

function isValidSessionID(value: string) {
  return value.startsWith('05') && value.length === 66 && /^[0-9a-f]+$/.test(value)
}

export function NewConversation() {
  const account = useAppSelector(selectAccount)
  const [mode, setMode] = React.useState<'dm' | 'group'>('dm')
  const [recipient, setRecipient] = React.useState('')
  const { t } = useTranslation()
  const [disabled, setDisabled] = React.useState(false)
  const navigate = useNavigate()

  // group state
  const [groupName, setGroupName] = React.useState('')
  const [memberInput, setMemberInput] = React.useState('')
  const [members, setMembers] = React.useState<string[]>([])

  const handleCreateConversation = async () => {
    if (!account || disabled || !recipient) return

    let sessionID: string | null = null
    if(isValidSessionID(recipient)) {
      sessionID = recipient
    } else {
      if (recipient.length > 64 || !/^\w([\w-]*[\w])?$/.test(recipient)) {
        toast.error(t('onsInvalid'))
      } else {
        setDisabled(true)
        try {
          const hash = await generateOnsHash(recipient)
          const onsRequest = await fetch(import.meta.env.VITE_BACKEND_URL + '/ons?' + new URLSearchParams({
            hash
          }))
            .then(res => res.json() as Promise<{ ok: true, value: string | null } | { ok: false, error: string }>)
          if (!onsRequest.ok) {
            toast.error(onsRequest.error)
            return
          } else if (onsRequest.value === null) {
            toast.error(t('onsInvalid'))
            return
          } else {
            sessionID = await decryptONSValue(onsRequest.value, recipient)
          }
        } catch(e) {
          toast.error(e instanceof Error && e.message)
        } finally {
          setDisabled(false)
        }
      }
    }

    if (sessionID) {
      if (!await db.conversations.get({ accountSessionID: account.sessionID, id: recipient })) {
        await db.conversations.add({
          id: uuid(),
          accountSessionID: account.sessionID,
          sessionID,
          lastMessage: null,
          lastMessageTime: 0,
          type: ConversationType.DirectMessages
        })
      }
      navigate('/conversation/' + sessionID)
    }
  }

  const handleAddMember = () => {
    const candidate = memberInput.trim().toLowerCase()
    if (!isValidSessionID(candidate)) {
      toast.error(t('onsInvalid'))
      return
    }
    if (candidate === account?.sessionID) {
      toast.error('You cannot add yourself')
      return
    }
    if (members.includes(candidate)) {
      setMemberInput('')
      return
    }
    setMembers([...members, candidate])
    setMemberInput('')
  }

  const handleCreateGroup = async () => {
    if (!account || disabled) return
    const name = groupName.trim()
    if (!name || members.length === 0) return

    setDisabled(true)
    try {
      const idBytes = crypto.getRandomValues(new Uint8Array(16))
      const groupId = toHex(idBytes)
      const memberIDs = [...members]

      await db.conversations.add({
        id: uuid(),
        accountSessionID: account.sessionID,
        sessionID: groupId,
        type: ConversationType.ClosedGroup,
        displayName: name,
        members: memberIDs.map(sessionID => ({ sessionID })),
        lastMessage: null,
        lastMessageTime: 0,
      })

      try {
        const timestamp = await getNowWithNetworkOffset()
        const fullRoster = [account.sessionID, ...memberIDs]
        const announceMsg = new VisibleMessage({
          body: '',
          lokiProfile: await UserUtils.getOurProfile(),
          timestamp,
          expirationType: 'unknown',
          expireTimer: 0,
          identifier: uuid(),
          attachments: [],
          preview: [],
          quote: undefined,
          group: { id: idBytes, name, members: fullRoster, type: 'UPDATE' },
        })
        const announceSync = new VisibleMessage({
          body: '',
          lokiProfile: undefined,
          timestamp,
          expirationType: 'unknown',
          expireTimer: 0,
          identifier: uuid(),
          attachments: [],
          preview: [],
          quote: undefined,
          syncTarget: groupId,
          group: { id: idBytes, name, members: fullRoster, type: 'UPDATE' },
        })
        for (const member of memberIDs) {
          const r = await sendMessage(member, announceMsg, announceSync)
          if (r.ok) {
            await db.messages_seen.add({
              hash: r.syncHash,
              receivedAt: Date.now(),
              accountSessionID: account.sessionID,
            })
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to announce group')
      }

      navigate('/conversation/' + groupId)
    } finally {
      setDisabled(false)
    }
  }

  return (
    <div className='flex flex-col items-center gap-4'>
      <div className='flex gap-2'>
        <Button
          variant={mode === 'dm' ? 'secondary' : 'ghost'}
          size='sm'
          onClick={() => setMode('dm')}
        >{t('newConversationDm')}</Button>
        <Button
          variant={mode === 'group' ? 'secondary' : 'ghost'}
          size='sm'
          onClick={() => setMode('group')}
        >{t('newConversationGroup')}</Button>
      </div>

      {mode === 'dm' ? (
        <div className='flex flex-col items-center gap-3'>
          <h1 className='text-xl font-medium'>{t('recipient')}:</h1>
          <div className='flex items-center gap-2'>
            <TextField
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.toLowerCase())}
              placeholder={t('inputRecipient')}
              className='w-72 outline-none focus:border-neutral-500 transition-colors duration-75'
              maxLength={66}
              disabled={disabled}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateConversation()}
            />
            <Button
              size='icon'
              variant='secondary'
              disabled={recipient.length === 0 || disabled}
              onClick={handleCreateConversation}
            >
              <ArrowRight className='w-5 h-5' />
            </Button>
          </div>
          <a
            href="https://ons.sessionbots.directory"
            target='_blank'
            rel='nofollower noreferrer'
            className='text-neutral-600 hover:bg-neutral-800 hover:text-neutral-500 transition-all duration-100 underline-offset-2 mt-5 bg-neutral-900 rounded-full px-3 py-0.5 text-sm shadow-md hover:shadow-lg'
          >{t('aboutOns')}</a>
        </div>
      ) : (
        <div className='flex flex-col items-center gap-3 w-80'>
          <TextField
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder={t('groupNamePlaceholder')}
            className='w-full outline-none focus:border-neutral-500 transition-colors duration-75'
            maxLength={64}
            disabled={disabled}
          />
          <div className='flex items-center gap-2 w-full'>
            <TextField
              value={memberInput}
              onChange={(e) => setMemberInput(e.target.value.toLowerCase())}
              placeholder={t('inputRecipient')}
              className='flex-1 outline-none focus:border-neutral-500 transition-colors duration-75'
              maxLength={66}
              disabled={disabled}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMember())}
            />
            <Button
              size='sm'
              variant='secondary'
              disabled={disabled}
              onClick={handleAddMember}
            >{t('add')}</Button>
          </div>
          {members.length > 0 && (
            <div className='flex flex-col gap-1 w-full'>
              {members.map(member => (
                <div key={member} className='flex items-center gap-2 bg-neutral-800 rounded-lg px-2 py-1 text-xs'>
                  <span className='truncate flex-1'>{member.slice(0, 6)}...{member.slice(-4)}</span>
                  <button
                    onClick={() => setMembers(members.filter(m => m !== member))}
                    className='text-neutral-400 hover:text-white shrink-0'
                  >
                    <X className='w-3 h-3' />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button
            variant='secondary'
            className='w-full'
            disabled={disabled || !groupName.trim() || members.length === 0}
            onClick={handleCreateGroup}
          >{t('createGroup')}</Button>
        </div>
      )}
    </div>
  )
}
