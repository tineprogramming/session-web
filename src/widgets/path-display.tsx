import * as React from 'react'
import { fetchGeoip, countryFlag } from '@/shared/api/onion-path'
import { getLastOnionPath } from '@/shared/api/onion-request'

type Row = { label: string; ip?: string; flag: string; country: string | null }

// Live onion path display (spec §3.9): You -> Guard -> Middle -> Swarm -> Recipient,
// showing each hop's flag, IP and country — including the client's own IP.
export function PathDisplay() {
  const [rows, setRows] = React.useState<Row[] | null>(null)

  React.useEffect(() => {
    let cancelled = false

    async function refresh() {
      const path = getLastOnionPath()
      if (!path) return
      const ips = [path.guard.ip, path.middle.ip, path.exit.ip]
      try {
        const { client, geo } = await fetchGeoip(ips)
        if (cancelled) return
        const hop = (label: string, ip: string): Row => ({
          label,
          ip,
          flag: countryFlag(geo[ip]?.countryCode ?? null),
          country: geo[ip]?.country ?? null,
        })
        setRows([
          { label: 'You', ip: client?.ip, flag: countryFlag(client?.countryCode ?? null), country: client?.country ?? null },
          hop('Guard', path.guard.ip),
          hop('Middle', path.middle.ip),
          hop('Swarm', path.exit.ip),
          { label: 'Recipient', flag: '', country: null },
        ])
      } catch {
        // best-effort; keep previous rows
      }
    }

    refresh()
    const id = setInterval(refresh, 15000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return (
    <div className='px-3 py-2 text-[11px] text-muted-foreground select-none'>
      <div className='flex items-center gap-1 mb-1'>
        <span className={rows ? 'text-brand' : 'text-neutral-500'}>●</span>
        <span className='font-medium'>{rows ? 'Onion path' : 'Connecting…'}</span>
      </div>
      {rows && (
        <ol className='flex flex-col gap-[2px]'>
          {rows.map((r, i) => (
            <li key={i} className='flex items-center justify-between gap-2'>
              <span className='text-neutral-400 shrink-0'>{r.label}</span>
              <span className='truncate text-right'>
                {r.flag && <span className='mr-1'>{r.flag}</span>}
                {r.ip && <span className='text-neutral-300'>{r.ip}</span>}
                {r.country && <span className='text-neutral-500'> · {r.country}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
