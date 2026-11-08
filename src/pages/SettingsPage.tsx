import { AnimatePresence, motion } from 'framer-motion'
import { Cpu, Gamepad2, Puzzle, AudioLines } from 'lucide-react'
import { useUi, type SettingsTab } from '@/store/ui'
import { audio } from '@/audio/AudioManager'
import { PerformanceTab } from '@/components/settings/PerformanceTab'
import { GameTab } from '@/components/settings/GameTab'
import { AudioTab } from '@/components/settings/AudioTab'
import { OptionalModsList } from '@/components/settings/OptionalModsList'
import { Section } from '@/components/settings/SettingRow'
import { cn, EASE } from '@/lib/cn'

const TABS: { id: SettingsTab; label: string; icon: typeof Cpu }[] = [
  { id: 'performance', label: 'Desempenho', icon: Cpu },
  { id: 'game', label: 'Jogo & Vídeo', icon: Gamepad2 },
  { id: 'mods', label: 'Mods opcionais', icon: Puzzle },
  { id: 'audio', label: 'Áudio & Visual', icon: AudioLines },
]

export function SettingsPage() {
  const tab = useUi((s) => s.settingsTab)
  const setTab = useUi((s) => s.setSettingsTab)

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-7 pr-16 pt-6">
        <h1 className="font-display text-[40px] text-fg">Configurações</h1>
        <p className="mt-1 text-xs text-subtle">Salvas automaticamente.</p>
        <nav className="mt-4 flex gap-1 border-b border-line" role="tablist">
          {TABS.map((t) => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onMouseEnter={() => audio.play('hover')}
                onClick={() => {
                  if (!active) audio.play('tab')
                  setTab(t.id)
                }}
                className={cn('relative flex items-center gap-2 px-3 pb-2.5 pt-1 text-sm transition-colors', active ? 'text-fg' : 'text-muted hover:text-fg')}
              >
                <t.icon size={15} className={cn(active && 'text-accent-strong')} />
                <span className={cn(active && 'font-semibold')}>{t.label}</span>
                {active && <motion.span layoutId="settings-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent-strong" transition={{ type: 'spring', stiffness: 460, damping: 36 }} />}
              </button>
            )
          })}
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 12, filter: 'blur(6px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -8, filter: 'blur(4px)' }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            {tab === 'performance' && <PerformanceTab />}
            {tab === 'game' && <GameTab />}
            {tab === 'mods' && (
              <Section title="Mods opcionais / client-side" desc="Ative só o que quiser. Mods conflitantes são desligados automaticamente.">
                <OptionalModsList />
              </Section>
            )}
            {tab === 'audio' && <AudioTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
