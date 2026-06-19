import { Separator } from '@/shared/ui/separator'
import { NewConversation } from '@/widgets/new-conversation'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { MdArrowBack } from 'react-icons/md'

export function NewConversationPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className='flex flex-col flex-1 h-full'>
      <div className="flex items-center gap-2 px-4 py-2 h-14 shrink-0">
        <button
          onClick={() => navigate('/')}
          title="Back"
          className="md:hidden text-neutral-300 hover:text-white shrink-0 -ml-1"
        >
          <MdArrowBack className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">
          {t('newConversationDm')}
        </h1>
      </div>
      <Separator />
      <div className='flex-1 w-full flex justify-center items-center'>
        <NewConversation />
      </div>
    </div>
  )
}
