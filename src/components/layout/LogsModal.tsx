import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Copy, ArrowDownToLine, Trash2 } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useLaunch } from '@/store/launch'
import { audio } from '@/audio/AudioManager'
import { toast } from '@/store/toasts'
import { cn, EASE } from '@/lib/cn'

const levelClass = (l: string) => (l.includes('/WARN') ? 'text-amber-300' : l.includes('/ERROR') ? 'text-rose-300' : l.includes('[Launcher]') ? 'text-aether-300' : l.includes('[CHAT]') ? 'text-rune-300' : 'text-slate-400')

export function LogsModal() {
  const open = useUi((s) => s.logsOpen)
  const setOpen = useUi((s) => s.setLogsOpen)
  const logs = useLaunch((s) => s.logs)
  const phase = useLaunch((s) => s.phase)
  const [follow, setFollow] = useState(true)
  const [cleared, setCleared] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [logs, follow, open])

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        audio.play('close')
        setOpen(false)
      }
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, setOpen])

  const visible = logs.slice(cleared)

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <motion.div
            className="absolute inset-0 bg-void-950/70 backdrop-blur-sm"
            onClick={() => {
              audio.play('close')
              setOpen(false)
            }}
          />
          <motion.div
            role="dialog"
            aria-label="Logs em tempo real"
            initial={{ opacity: 0, scale: 0.94, y: 20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.96, y: 10, filter: 'blur(6px)' }}
            transition={{ duration: 0.45, ease: EASE }}
            className="glass-strong relative flex h-full max-h-[620px] w-full max-w-4xl flex-col overflow-hidden rounded-3xl shadow-2xl shadow-black/60"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                </span>
                <span className="font-mono text-sm text-slate-200">latest.log</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', phase === 'running' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/[0.06] text-slate-400')}>
                  {phase === 'running' ? '● ao vivo' : phase}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {[
                  { icon: ArrowDownToLine, label: follow ? 'Auto-scroll ligado' : 'Auto-scroll desligado', on: follow, fn: () => setFollow((v) => !v) },
                  {
                    icon: Copy,
                    label: 'Copiar',
                    fn: () => {
                      navigator.clipboard?.writeText(visible.join('\n')).catch(() => {})
                      toast({ kind: 'info', title: 'Logs copiados' }, 1800)
                    },
                  },
                  { icon: Trash2, label: 'Limpar', fn: () => setCleared(logs.length) },
                  { icon: X, label: 'Fechar', fn: () => setOpen(false), close: true },
                ].map((b) => (
                  <button
                    key={b.label}
                    title={b.label}
                    aria-label={b.label}
                    onMouseEnter={() => audio.play('hover')}
                    onClick={() => {
                      audio.play(b.close ? 'close' : 'click')
                      b.fn()
                    }}
                    className={cn('grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-white/[0.07]', b.on ? 'text-rune-300' : 'text-slate-400 hover:text-white')}
                  >
                    <b.icon size={15} />
                  </button>
                ))}
              </div>
            </div>
            <div ref={box} onWheel={() => box.current && setFollow(box.current.scrollTop + box.current.clientHeight >= box.current.scrollHeight - 8)} className="flex-1 overflow-y-auto bg-black/40 px-5 py-4 font-mono text-[11.5px] leading-[1.7]">
              {visible.length === 0 && <div className="text-slate-600">Sem logs. Clique em JOGAR para ver a saída do jogo aqui.</div>}
              {visible.map((l, i) => (
                <motion.div key={cleared + i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className={cn('whitespace-pre-wrap break-all select-text', levelClass(l))}>
                  {l}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
