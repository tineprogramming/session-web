import React from 'react'
import * as Storage from '@/shared/api/storage'
import { Separator } from '@/shared/ui/separator'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppSelector } from '@/shared/store/hooks'
import { selectAccount } from '@/shared/store/slices/account'
import { formatSessionID } from '@/shared/utils'
import { Conversation, ConversationRef } from '@/widgets/conversation'
import { ConversationMessageInput } from '@/features/conversation-message-input'
import { MdEdit } from 'react-icons/md'

export function ConversationPage() {
  const account = useAppSelector(selectAccount)
  const conversationID = useParams().id
  const navigate = useNavigate()
  const conversationRef = React.useRef<ConversationRef>(null)

  React.useEffect(() => {
    async function getConversation() {
      if (!account) return

      if (!await Storage.db.conversations.get({ sessionID: conversationID, accountSessionID: account.sessionID })) {
        navigate('/')
      } else {
        
        const messages = await Storage.db.messages.where({ conversationID, accountSessionID: account.sessionID, read: Number(false) as 0 | 1 }).primaryKeys()
        await Storage.db.messages.bulkUpdate(messages.map(hash => ({
          key: hash,
          changes: {
            read: Number(true) as 0 | 1
          }
        })))
      }
    }

    getConversation()
  }, [conversationID, navigate, account])

  const conversation = useLiveQuery(() => account
    ? Storage.db.conversations.get({ sessionID: conversationID, accountSessionID: account.sessionID })
    : undefined,
  [conversationID, account])

  const handleSent = () => {
    conversationRef.current?.scrollToBottom()
  }

  const [editingName, setEditingName] = React.useState(false)
  const [nameDraft, setNameDraft] = React.useState('')

  const startEditName = () => {
    setNameDraft(conversation?.displayName ?? '')
    setEditingName(true)
  }
  const saveName = async () => {
    if (conversation && account) {
      await Storage.db.conversations.update(conversation.id, { displayName: nameDraft.trim() || undefined })
    }
    setEditingName(false)
  }

  return (
    <div className='flex flex-col flex-1 h-full'>
      <div className="flex items-center gap-2 px-4 py-2 h-14 shrink-0">
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
            placeholder={conversation ? formatSessionID(conversation.sessionID, 'long') : ''}
            className="text-xl font-bold bg-transparent outline-none border-b border-neutral-700 focus:border-brand min-w-0 flex-1"
          />
        ) : (
          <>
            <h1 className="text-xl font-bold truncate">
              {conversation && (conversation.displayName || formatSessionID(conversation.sessionID, 'long'))}
            </h1>
            {conversation && (
              <button onClick={startEditName} title="Set name" className="text-neutral-500 hover:text-white shrink-0">
                <MdEdit className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>
      <Separator />
      {/* <div className="bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60"> */}
      {/* <Search /> */}
      {/* <form>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search" className="pl-8" />
            </div>
          </form> */}
      {/* </div> */}
      {conversationID !== undefined && <Conversation conversationID={conversationID} ref={conversationRef} />}
      {conversationID !== undefined && <ConversationMessageInput conversationID={conversationID} onSent={handleSent} />}
    </div>
  )
}
