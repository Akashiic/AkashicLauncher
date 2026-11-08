import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Package, HardDrive, Puzzle, Hammer } from 'lucide-react'
import { CORE_MODS } from '@/lib/content'
import { GlowCard } from '@/components/ui/GlowCard'
import { OptionalModsList } from '@/components/settings/OptionalModsList'
import { OPTIONAL_MODS, useSettings } from '@/store/settings'
import { EASE } from '@/lib/cn'
import { Versioned } from '@/components/ui/Version'

export function ModpackPage() {
  const [q, setQ] = useState('')
  const mods = useSettings((s) => s.settings.optionalMods)
  const enabled = OPTIONAL_MODS.filter((m) => mods[m.id]).length
  const list = useMemo(() => CORE_MODS.filter(([n, , c]) => `${n} ${c}`.toLowerCase().includes(q.toLowerCase())), [q])

  const stats = [
    { icon: Package, label: 'Mods inclusos', value: '186' },
    { icon: Puzzle, label: 'Opcionais ativos', value: `${enabled}/${OPTIONAL_MODS.length}` },
    { icon: HardDrive, label: 'Tamanho', value: '1.84 GB' },
    { icon: Hammer, label: 'Forge', value: '10.13.4.1614' },
  ]

  return (
    <div className="h-full overflow-y-auto px-7 py-6">
      <h1 className="pr-12 font-display text-[40px] text-fg">Modpack</h1>
      <p className="mt-1 text-sm text-muted">
        <Versioned text="Akashic Survival 3.4 · Minecraft 1.7.10" />
      </p>

      <div className="mt-5 grid grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <GlowCard key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, ease: EASE, duration: 0.6 }} className="p-4">
            <s.icon size={16} className="relative z-[3] text-accent-strong" />
            <div className="relative z-[3] mt-3 font-display text-[32px] text-accent-strong">{s.value}</div>
            <div className="relative z-[3] text-xs text-muted">{s.label}</div>
          </GlowCard>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <section>
          <h2 className="label mb-3">Mods opcionais (client-side)</h2>
          <OptionalModsList />
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="label">Principais mods inclusos</h2>
          </div>
          <div className="panel rounded-2xl p-3">
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar mod ou categoria…"
                className="h-10 w-full rounded-xl border border-line bg-bg/70 pl-9 pr-3 text-sm text-fg placeholder:text-subtle transition-colors focus:border-accent focus:outline-none"
              />
            </div>
            <ul className="max-h-[420px] overflow-y-auto pr-1">
              {list.map(([name, ver, cat], i) => (
                <motion.li key={name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-overlay/[0.04]">
                  <span className="text-fg">{name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-[11px] text-subtle">{cat}</span>
                    <span className="font-mono text-[11px] text-muted">{ver}</span>
                  </span>
                </motion.li>
              ))}
              {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-subtle">Nenhum mod encontrado.</li>}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
