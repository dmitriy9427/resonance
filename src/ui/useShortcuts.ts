import { useEffect } from 'react'
import { usePlayer } from '@/store/player'
import { commandFor } from './keys'

export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen?.()
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // В полях ввода (громкость, перемотка) стрелки и пробел — их собственные.
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select')) return
      const command = commandFor(e.code)
      if (!command) return
      // Пробел на кнопке «нажал» бы кнопку ещё раз — перехватываем.
      e.preventDefault()
      const p = usePlayer.getState()
      if (command === 'toggle') void p.toggle()
      else if (command === 'scene1') p.setScene('sphere')
      else if (command === 'scene2') p.setScene('galaxy')
      else if (command === 'scene3') p.setScene('terrain')
      else if (command === 'next') p.nextScene(1)
      else if (command === 'prev') p.nextScene(-1)
      else if (command === 'fullscreen') toggleFullscreen()
      else if (command === 'hide') p.setUiHidden(!p.uiHidden)
      else if (command === 'mute') p.toggleMute()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
