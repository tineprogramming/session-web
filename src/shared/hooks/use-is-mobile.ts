import React from 'react'

/**
 * True when the viewport is too narrow for the two-panel desktop layout
 * (phones and portrait tablets/foldables). Defaults to Tailwind's lg (1024px)
 * so cramped ~800px portrait tablets also get the single-column layout.
 */
export function useIsMobile(breakpoint = 1024): boolean {
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint,
  )
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = () => setIsMobile(mq.matches)
    handler()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return isMobile
}
