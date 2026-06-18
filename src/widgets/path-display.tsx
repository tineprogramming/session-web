import * as React from 'react'
import { fetchOnionPath, countryFlag, OnionHop } from '@/shared/api/onion-path'

// Live onion path display (spec §3.9): You -> Guard -> Middle -> Swarm -> Recipient.
export function PathDisplay() {
  const [path, setPath] = React.useState<OnionHop[] | null>(null)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetchOnionPath()
      .then(hops => { if (!cancelled) setPath(hops) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [])

  if (error) return null

  return (
    <div className='px-3 py-2 text-[11px] text-muted-foreground select-none'>
      <div className='flex items-center gap-1 mb-1'>
        <span className={path ? 'text-brand' : 'text-neutral-500'}>●</span>
        <span className='font-medium'>{path ? 'Onion path' : 'Connecting…'}</span>
      </div>
      {path && (
        <ol className='flex flex-col gap-[2px]'>
          <Hop label='You' />
          {path.map((hop, i) => (
            <Hop
              key={i}
              label={hop.label}
              detail={`${countryFlag(hop.countryCode)} ${hop.country ?? hop.ip}`}
            />
          ))}
          <Hop label='Recipient' />
        </ol>
      )}
    </div>
  )
}

function Hop({ label, detail }: { label: string; detail?: string }) {
  return (
    <li className='flex items-center justify-between gap-2'>
      <span className='text-neutral-400'>{label}</span>
      {detail && <span className='truncate max-w-[120px] text-right'>{detail}</span>}
    </li>
  )
}
