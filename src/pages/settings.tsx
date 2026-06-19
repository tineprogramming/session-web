import { Separator } from '@/shared/ui/separator'
import { Button } from '@/shared/ui/button'
import { AccountSwitcher } from '@/features/account-switcher'
import { useTranslation } from 'react-i18next'
import { showTestNotification } from '@/shared/notifications'
import { toast } from 'sonner'
import { BellIcon } from 'lucide-react'

export function SettingsPage() {
  const { t } = useTranslation()

  const testNotifications = async () => {
    const r = await showTestNotification()
    if (r === 'granted') toast.success(t('notificationsEnabled'))
    else if (r === 'denied') toast.error(t('notificationsBlocked'))
    else toast.error(t('notificationsUnsupported'))
  }

  return (
    <div className='flex flex-col flex-1 h-full'>
      <div className='h-16 flex items-center px-4 shrink-0'>
        <h1 className='text-2xl font-extrabold'>{t('settings')}</h1>
      </div>
      <Separator />
      <div className='flex-1 overflow-auto p-4 flex flex-col gap-3'>
        <span className='text-sm text-muted-foreground'>{t('account')}</span>
        <div className='shrink-0'>
          <AccountSwitcher isCollapsed={false} />
        </div>
        <Button variant='secondary' className='justify-start gap-3' onClick={testNotifications}>
          <BellIcon className='w-4 h-4' />
          {t('testNotifications')}
        </Button>
        <div className='mt-auto pt-6 text-center text-xs text-muted-foreground select-none'>
          Apocentro · v{import.meta.env.VITE_GIT_COMMIT_HASH?.slice(0, 7) ?? '0.0.1'}
        </div>
      </div>
    </div>
  )
}
