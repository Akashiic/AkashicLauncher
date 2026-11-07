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

const TABS: { id: SettingsTab; label: string; sub: string; icon: typeof Cpu }[] = [
  { id: 'performance', label: 'Desempenho & Java', sub: 'RAM, Java e JVM', icon: Cpu },
  { id: 'game', label: 'Jogo & Vídeo', sub: 'Resolução e comportamento', icon: Gamepad2 },
  { id: 'mods', label: 'Mods Opcionais', sub: 'Client-side', icon: Puzzle },
  { id: 'audio', label: 'Áudio & Estética', sub: 'Volumes e visual', icon: AudioLines },
]

export function SettingsPage() {
  const tab = useUi((s) => s.settingsTab)
  const setTab = useUi((s) => s.setSettingsTab)

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 border-r border-line px-4 py-8">
        <h1 className="px-3 font-display text-[40px] text-fg">Configurações</h1>
        <p className="mb-6 px-3 text-xs text-subtle">Salvas automaticamente.</p>
        <nav className="space-y-1" role="tablist" aria-orientation="vertical">
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
                className={cn('relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', active ? 'text-fg' : 'text-muted hover:bg-overlay/[0.04] hover:text-fg')}
              >
                {active && <motion.span layoutId="settings-tab" className="absolute inset-0 rounded-xl border border-accent/60 bg-brand" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                <t.icon size={17} className={cn('relative', active && 'text-fg')} />
                <span className="relative">
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className={cn('block text-xs', active ? 'text-muted' : 'text-subtle')}>{t.sub}</span>
                </span>
              </button>
            )
          })}
        </nav>
      </div>
      <div className="relative flex-1 overflow-y-auto px-8 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 16, filter: 'blur(6px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -10, filter: 'blur(4px)' }}
            transition={{ duration: 0.35, ease: EASE }}
            className="mx-auto max-w-3xl"
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
