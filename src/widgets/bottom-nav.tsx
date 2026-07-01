import { NavLink } from 'react-router-dom'
import { MessageSquare, Globe, Settings } from 'lucide-react'
import cx from 'classnames'
import { useTranslation } from 'react-i18next'

const items = [
  { to: '/', key: 'chats', Icon: MessageSquare, end: true },
  { to: '/network', key: 'network', Icon: Globe, end: false },
  { to: '/settings', key: 'settings', Icon: Settings, end: false },
]

/** Bottom navigation for the mobile (single-column) layout. */
export function BottomNav() {
  const { t } = useTranslation()
  return (
    <nav className='shrink-0 h-16 bg-[#121216] border-t border-neutral-800 flex pb-[env(safe-area-inset-bottom)]'>
      {items.map(({ to, key, Icon, end }) => (
        <NavLink
          key={key}
          to={to}
          end={end}
          className={({ isActive }) => cx(
            'flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
            isActive ? 'text-brand' : 'text-neutral-500 hover:text-neutral-300',
          )}
        >
          <Icon className='w-6 h-6' />
          {t(key)}
        </NavLink>
      ))}
    </nav>
  )
}
