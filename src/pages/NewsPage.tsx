import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Plus, Wrench, RefreshCw, Minus } from 'lucide-react'
import { NEWS, type NewsItem } from '@/lib/content'
import { GlowCard } from '@/components/ui/GlowCard'
import { Segmented } from '@/components/ui/Segmented'
import { audio } from '@/audio/AudioManager'
import { cn, EASE } from '@/lib/cn'

const CHANGE_ICON = {
  add: { icon: Plus, cls: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20' },
  fix: { icon: Wrench, cls: 'text-sky-300 bg-sky-400/10 border-sky-400/20' },
  change: { icon: RefreshCw, cls: 'text-amber-300 bg-amber-400/10 border-amber-400/20' },
  remove: { icon: Minus, cls: 'text-rose-300 bg-rose-400/10 border-rose-400/20' },
}

type Filter = 'all' | NewsItem['tag']

export function NewsPage() {
  const [open, setOpen] = useState<string | null>(NEWS[0].id)
  const [filter, setFilter] = useState<Filter>('all')
  const list = NEWS.filter((n) => filter === 'all' || n.tag === filter)

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">Changelog & Notícias</h1>
            <p className="mt-1 text-sm text-slate-400">Tudo o que mudou no servidor, em ordem cronológica.</p>
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

        <div className="relative mt-8 pl-8">
          <div className="absolute bottom-2 left-[11px] top-2 w-px bg-gradient-to-b from-aether-400/60 via-white/10 to-transparent" />
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
                  <span className="absolute -left-[27px] top-6 h-3 w-3 rounded-full border-2 border-void-900" style={{ background: `rgb(${n.accent})`, boxShadow: `0 0 14px rgb(${n.accent})` }} />
                  <GlowCard glow={n.accent} className="overflow-hidden">
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
                          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-semibold uppercase tracking-wider" style={{ color: `rgb(${n.accent})` }}>
                            {n.tag}
                          </span>
                          <span className="text-slate-500">{n.date}</span>
                          {n.version && <span className="font-mono text-slate-500">v{n.version}</span>}
                        </div>
                        <h3 className="mt-2 font-display text-lg font-semibold text-white">{n.title}</h3>
                        <p className="mt-1 text-sm text-slate-400">{n.excerpt}</p>
                      </div>
                      {n.changes && (
                        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.35, ease: EASE }} className="text-slate-400">
                          <ChevronDown size={18} />
                        </motion.span>
                      )}
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && n.changes && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }} className="relative z-[3] overflow-hidden">
                          <ul className="space-y-2 border-t border-white/[0.06] px-5 pb-5 pt-4">
                            {n.changes.map((c, j) => {
                              const { icon: Icon, cls } = CHANGE_ICON[c.type]
                              return (
                                <motion.li key={j} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + j * 0.04, ease: EASE }} className="flex items-start gap-3 text-sm text-slate-300">
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
