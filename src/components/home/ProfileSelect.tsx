import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronUp, Check, Layers } from 'lucide-react'
import { PROFILES, useSettings } from '@/store/settings'
import { useLaunch } from '@/store/launch'
import { audio } from '@/audio/AudioManager'
import { cn, EASE } from '@/lib/cn'

export function ProfileSelect() {
  const [open, setOpen] = useState(false)
  const profileId = useSettings((s) => s.settings.profileId)
  const update = useSettings((s) => s.update)
  const busy = useLaunch((s) => s.phase !== 'ready')
  const ref = useRef<HTMLDivElement>(null)
  const current = PROFILES.find((p) => p.id === profileId) ?? PROFILES[0]

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
      <button
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseEnter={() => audio.play('hover')}
        onClick={() => {
          audio.play(open ? 'close' : 'click')
          setOpen((v) => !v)
        }}
        className="glass glow-border flex h-16 w-72 items-center gap-3 rounded-2xl px-4 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-50"
      >
        <span className="relative z-[3] grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-aether-500/30 to-rune-500/20 text-aether-300">
          <Layers size={18} />
        </span>
        <span className="relative z-[3] min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{current.name}</span>
          <span className="block truncate text-[11px] text-slate-400">{current.sub}</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3, ease: EASE }} className="relative z-[3] text-slate-400">
          <ChevronUp size={16} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: 10, scale: 0.97, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 8, scale: 0.98, filter: 'blur(4px)' }}
            transition={{ duration: 0.3, ease: EASE }}
            className="glass-strong absolute bottom-[calc(100%+10px)] left-0 z-50 w-72 origin-bottom rounded-2xl p-1.5 shadow-2xl shadow-black/60"
          >
            <li className="label px-3 pb-1 pt-2">Perfil / Versão</li>
            {PROFILES.map((p, i) => {
              const active = p.id === profileId
              return (
                <motion.li key={p.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04, ease: EASE }}>
                  <button
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => audio.play('hover')}
                    onClick={() => {
                      audio.play('toggleOn')
                      update({ profileId: p.id })
                      setOpen(false)
                    }}
                    className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', active ? 'bg-aether-500/15' : 'hover:bg-white/[0.05]')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium text-white">
                        {p.name}
                        <span className="rounded border border-white/10 px-1.5 text-[9px] uppercase tracking-wider text-slate-400">{p.badge}</span>
                      </span>
                      <span className="block text-[11px] text-slate-400">{p.sub}</span>
                    </span>
                    {active && <Check size={15} className="text-rune-400" />}
                  </button>
                </motion.li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
