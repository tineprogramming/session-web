import { Separator } from '@/shared/ui/separator'
import { PathDisplay } from '@/widgets/path-display'
import { useTranslation } from 'react-i18next'

export function NetworkPage() {
  const { t } = useTranslation()
  return (
    <div className='flex flex-col flex-1 h-full'>
      <div className='h-16 flex items-center px-4 shrink-0'>
        <h1 className='text-2xl font-extrabold'>{t('network')}</h1>
      </div>
      <Separator />
      <div className='flex-1 overflow-auto'>
        <PathDisplay />
      </div>
    </div>
  )
}
