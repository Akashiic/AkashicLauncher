import { useMemo } from 'react'
import { audio, type SfxName } from '@/audio/AudioManager'

/** Props prontas para hover/click sonoros em qualquer elemento interativo. */
export function useSfx(click: SfxName | null = 'click', hover: SfxName | null = 'hover') {
  return useMemo(
    () => ({
      onMouseEnter: hover ? () => audio.play(hover) : undefined,
      onPointerDown: click ? () => audio.play(click) : undefined,
    }),
    [click, hover],
  )
}

export const sfx = (name: SfxName, pitch?: number) => audio.play(name, { pitch })
