import { useEffect } from 'react'
import { useServer } from '@/store/server'
import { Tooltip } from '@/components/ui/Tooltip'
import { audio } from '@/audio/AudioManager'
import { cn } from '@/lib/cn'

const STATE = {
  online: { label: 'Online', dot: 'bg-success', text: 'text-success' },
  maintenance: { label: 'Manutenção', dot: 'bg-warning', text: 'text-warning' },
  offline: { label: 'Offline', dot: 'bg-danger', text: 'text-danger-text' },
} as const

/** Status do servidor em uma linha: estado + jogadores. */
export function ServerStatus() {
  const { state, players, maxPlayers, tick, cycleState } = useServer()
  useEffect(() => {
    const id = window.setInterval(tick, 2800)
    return () => window.clearInterval(id)
  }, [tick])

  const s = STATE[state]
  return (
    <Tooltip content="Clique para simular outro estado (mock)">
      <button
        onMouseEnter={() => audio.play('hover')}
        onClick={() => {
          audio.play('tab')
          cycleState()
        }}
        className="flex items-center gap-2.5 text-sm"
      >
        <span className="relative flex h-2 w-2">
          <span className={cn('absolute h-full w-full rounded-full pulse-ring', s.dot)} />
          <span className={cn('relative h-2 w-2 rounded-full', s.dot)} />
        </span>
        <span className={cn('font-semibold', s.text)}>{s.label}</span>
        {state === 'online' && (
          <span className="tabular-nums text-muted">
            {players}/{maxPlayers} jogadores
          </span>
        )}
      </button>
    </Tooltip>
  )
}
