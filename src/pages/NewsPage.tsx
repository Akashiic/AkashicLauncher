import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Plus, Wrench, RefreshCw, Minus } from 'lucide-react'
import { NEWS, type NewsItem } from '@/lib/content'
import { GlowCard } from '@/components/ui/GlowCard'
import { Segmented } from '@/components/ui/Segmented'
import { audio } from '@/audio/AudioManager'
import { cn, EASE } from '@/lib/cn'
import { TONE_VAR, TONE_TEXT } from '@/theme'

const CHANGE_ICON = {
  add: { icon: Plus, cls: 'text-success bg-success/10 border-success/20' },
  fix: { icon: Wrench, cls: 'text-fg bg-overlay/10 border-overlay/20' },
  change: { icon: RefreshCw, cls: 'text-warning bg-warning/10 border-warning/20' },
  remove: { icon: Minus, cls: 'text-danger-text bg-danger/10 border-danger/20' },
}

type Filter = 'all' | NewsItem['tag']

export function NewsPage() {
  const [open, setOpen] = useState<string | null>(NEWS[0].id)
  const [filter, setFilter] = useState<Filter>('all')
  const list = NEWS.filter((n) => filter === 'all' || n.tag === filter)

  return (
    <div className="h-full overflow-y-auto px-7 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col items-start gap-4 pr-12">
          <div>
            <h1 className="font-display text-[40px] text-fg">Notícias</h1>
            <p className="mt-1 text-sm text-muted">Tudo o que mudou no servidor, em ordem cronológica.</p>
          </div>
          <Segmented<Filter>
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Tudo' },
              { value: 'Atualização', label: 'Atualizações' },
              { value: 'Correção', label: 'Correções' },
              { value: 'Evento', label: 'Eventos' },
            ]}
          />
        </div>

        <div className="relative mt-6 pl-8">
          <div className="absolute bottom-2 left-[11px] top-2 w-px bg-line" />
          <AnimatePresence mode="popLayout">
            {list.map((n, i) => {
              const isOpen = open === n.id
              return (
                <motion.div
                  key={n.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ delay: i * 0.05, duration: 0.5, ease: EASE }}
                  className="relative mb-4"
                >
                  <span className="absolute -left-[27px] top-6 h-3 w-3 rounded-full border-2 border-bg" style={{ background: TONE_VAR[n.accent], boxShadow: `0 0 12px ${TONE_VAR[n.accent]}` }} />
                  <GlowCard glow={TONE_VAR[n.accent]} className="overflow-hidden">
                    <button
                      onMouseEnter={() => audio.play('hover')}
                      onClick={() => {
                        audio.play(isOpen ? 'close' : 'tab')
                        setOpen(isOpen ? null : n.id)
                      }}
                      aria-expanded={isOpen}
                      className="relative z-[3] flex w-full items-center gap-4 p-5 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className={cn('rounded-md border border-line bg-overlay/[0.04] px-2 py-0.5 font-semibold uppercase tracking-wider', TONE_TEXT[n.accent])}>
                            {n.tag}
                          </span>
                          <span className="text-subtle">{n.date}</span>
                          {n.version && <span className="font-mono text-subtle">v{n.version}</span>}
                        </div>
                        <h3 className="mt-2 font-display text-[28px] text-fg">{n.title}</h3>
                        <p className="mt-1 text-sm text-muted">{n.excerpt}</p>
                      </div>
                      {n.changes && (
                        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.35, ease: EASE }} className="text-muted">
                          <ChevronDown size={18} />
                        </motion.span>
                      )}
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && n.changes && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }} className="relative z-[3] overflow-hidden">
                          <ul className="space-y-2 border-t border-line px-5 pb-5 pt-4">
                            {n.changes.map((c, j) => {
                              const { icon: Icon, cls } = CHANGE_ICON[c.type]
                              return (
                                <motion.li key={j} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + j * 0.04, ease: EASE }} className="flex items-start gap-3 text-sm text-muted">
                                  <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border', cls)}>
                                    <Icon size={11} strokeWidth={3} />
                                  </span>
                                  {c.text}
                                </motion.li>
                              )
                            })}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </GlowCard>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
