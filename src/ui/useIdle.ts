import { useEffect, useState } from 'react'

/** true, если мышь/клавиатура/касания не трогали `ms` миллисекунд (для автоскрытия плеера). */
export function useIdle(ms: number, enabled: boolean): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let timer = window.setTimeout(() => setIdle(true), ms)
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), ms)
    }
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, wake))
      setIdle(false)
    }
  }, [ms, enabled])
  return enabled && idle
}
