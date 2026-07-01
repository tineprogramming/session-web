import React from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { TextField } from '@/shared/ui/text-field'
import { db } from '@/shared/api/storage'
import { addGroupMember, removeGroupMember, leaveGroup } from '@/shared/api/group-admin'

export function GroupSettingsDialog({ groupID, accountSessionID, onClose }: {
  groupID: string
  accountSessionID: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [memberInput, setMemberInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const convo = useLiveQuery(
    () => db.conversations.get({ sessionID: groupID, accountSessionID }),
    [groupID, accountSessionID],
  )
  const members = (convo && 'members' in convo ? convo.members : []) ?? []
  const left = !!convo?.left

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast.error(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const handleAdd = () => run(async () => {
    await addGroupMember(groupID, accountSessionID, memberInput)
    setMemberInput('')
  })

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4' onClick={onClose}>
      <div
        className='w-[420px] max-w-full max-h-[80vh] overflow-auto bg-background border border-neutral-700 rounded-2xl p-5 flex flex-col gap-4'
        onClick={e => e.stopPropagation()}
      >
        <div className='flex items-center justify-between'>
          <h2 className='text-lg font-bold'>{t('groupMembers')}</h2>
          <button onClick={onClose} className='text-neutral-400 hover:text-white'><X className='w-5 h-5' /></button>
        </div>

        {!left && (
          <div className='flex items-center gap-2'>
            <TextField
              value={memberInput}
              onChange={e => setMemberInput(e.target.value.toLowerCase())}
              placeholder={t('inputRecipient')}
              className='flex-1 outline-none focus:border-neutral-500'
              maxLength={66}
              disabled={busy}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
            />
            <Button size='sm' variant='secondary' disabled={busy} onClick={handleAdd}>{t('add')}</Button>
          </div>
        )}

        <div className='flex flex-col gap-1'>
          {members.length === 0 && <span className='text-sm text-muted-foreground'>{t('noMembers')}</span>}
          {members.map(m => (
            <div key={m.sessionID} className='flex items-center gap-2 bg-neutral-800 rounded-lg px-3 py-1.5 text-xs'>
              <span className='truncate flex-1 font-mono'>{m.displayName || `${m.sessionID.slice(0, 8)}…${m.sessionID.slice(-6)}`}</span>
              {!left && (
                <button
                  disabled={busy}
                  onClick={() => run(() => removeGroupMember(groupID, accountSessionID, m.sessionID))}
                  title={t('removeMember')}
                  className='text-neutral-400 hover:text-red-400 shrink-0 disabled:opacity-50'
                >
                  <X className='w-4 h-4' />
                </button>
              )}
            </div>
          ))}
        </div>

        {left ? (
          <span className='text-sm text-center text-muted-foreground'>{t('youLeftGroup')}</span>
        ) : (
          <Button
            variant='secondary'
            className='w-full text-red-400 hover:text-red-300'
            disabled={busy}
            onClick={() => run(async () => { await leaveGroup(groupID, accountSessionID); onClose() })}
          >{t('leaveGroup')}</Button>
        )}
      </div>
    </div>
  )
}
