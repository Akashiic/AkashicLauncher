import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'
import { PROFILES, useSettings } from '@/store/settings'
import { useLaunch } from '@/store/launch'
import { useServer } from '@/store/server'
import { audio } from '@/audio/AudioManager'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn, EASE } from '@/lib/cn'

const STATE = {
  online: { label: 'Online', dot: 'bg-success', text: 'text-success' },
  maintenance: { label: 'Manutenção', dot: 'bg-warning', text: 'text-warning' },
  offline: { label: 'Offline', dot: 'bg-danger', text: 'text-danger-text' },
} as const

/** Perfil + status do servidor em um único bloco. Mantém o mock do servidor rodando. */
export function ProfileServer() {
  const [open, setOpen] = useState(false)
  const profileId = useSettings((s) => s.settings.profileId)
  const update = useSettings((s) => s.update)
  const busy = useLaunch((s) => s.phase !== 'ready')
  const { state, players, maxPlayers, tick, cycleState } = useServer()
  const ref = useRef<HTMLDivElement>(null)
  const current = PROFILES.find((p) => p.id === profileId) ?? PROFILES[0]
  const s = STATE[state]

  useEffect(() => {
    const id = window.setInterval(tick, 2800)
    return () => window.clearInterval(id)
  }, [tick])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <div className="flex items-stretch overflow-hidden rounded-xl border border-line bg-overlay/[0.03] transition-colors hover:border-line-strong">
        <button
          disabled={busy}
          aria-haspopup="listbox"
          aria-expanded={open}
          onMouseEnter={() => audio.play('hover')}
          onClick={() => {
            audio.play(open ? 'close' : 'click')
            setOpen((v) => !v)
          }}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-overlay/[0.04] disabled:opacity-50"
        >
          <span className="min-w-0 flex-1">
            <span className="label block !text-[11px]">Perfil</span>
            <span className="block truncate text-[15px] font-semibold text-fg">{current.name}</span>
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3, ease: EASE }} className="text-muted">
            <ChevronDown size={14} />
          </motion.span>
        </button>
        <Tooltip content="Simular outro estado do servidor (mock)" side="top">
          <button
            aria-label={`Servidor ${s.label}, ${players} de ${maxPlayers} jogadores`}
            onMouseEnter={() => audio.play('hover')}
            onClick={() => {
              audio.play('tab')
              cycleState()
            }}
            className="flex h-full items-center gap-2 border-l border-line px-3 text-[13px] transition-colors hover:bg-overlay/[0.04]"
          >
            <span className="relative flex h-2 w-2">
              <span className={cn('pulse-ring absolute h-full w-full rounded-full', s.dot)} />
              <span className={cn('relative h-2 w-2 rounded-full', s.dot)} />
            </span>
            {state === 'online' ? <span className="tabular-nums text-muted">{players}/{maxPlayers}</span> : <span className={cn('font-semibold', s.text)}>{s.label}</span>}
          </button>
        </Tooltip>
      </div>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: 8, scale: 0.98, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
            transition={{ duration: 0.28, ease: EASE }}
            className="panel-raised absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 origin-bottom rounded-2xl p-1.5"
          >
            {PROFILES.map((p) => {
              const active = p.id === profileId
              return (
                <li key={p.id}>
                  <button
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => audio.play('hover')}
                    onClick={() => {
                      audio.play('toggleOn')
                      update({ profileId: p.id })
                      setOpen(false)
                    }}
                    className={cn('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors', active ? 'bg-brand/50' : 'hover:bg-overlay/[0.05]')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{p.name}</span>
                      <span className="block truncate text-xs text-muted">{p.sub}</span>
                    </span>
                    {active && <Check size={14} className="text-accent-strong" />}
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
