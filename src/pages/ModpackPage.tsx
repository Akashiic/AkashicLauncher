import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Package, HardDrive, Puzzle, Sparkles, Loader2 } from 'lucide-react'
import { GlowCard } from '@/components/ui/GlowCard'
import { EASE } from '@/lib/cn'
import { Versioned } from '@/components/ui/Version'
import { ModpackVersions } from '@/components/modpack/ModpackVersions'
import { useModpackState } from '@/store/modpack'
import { formatMB } from '@/lib/modpack'
import { bridge, type InstalledMod } from '@/lib/bridge'

export function ModpackPage() {
  const [q, setQ] = useState('')
  const mp = useModpackState()
  // os mods de verdade da pasta do jogo (o pack do GitHub, como veio): null = lendo
  const [mods, setMods] = useState<InstalledMod[] | null>(bridge.game ? null : [])
  useEffect(() => {
    if (!bridge.game) return
    void bridge.game
      .mods()
      .then(setMods)
      .catch(() => setMods([]))
  }, [mp.installed])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (mods ?? []).filter((m) => !term || `${m.name} ${m.file}`.toLowerCase().includes(term))
  }, [mods, q])
  const active = (mods ?? []).filter((m) => m.enabled).length
  const off = (mods ?? []).length - active

  const stats = [
    { icon: Package, label: 'Instalada', value: mp.installed ? `TEOF-${mp.installed}` : '—' },
    { icon: Sparkles, label: 'Mais recente', value: mp.latest?.tag ?? '—' },
    { icon: HardDrive, label: 'Tamanho do pack', value: mp.latest?.asset ? formatMB(mp.latest.asset.size) : '—' },
    { icon: Puzzle, label: 'Mods instalados', value: mods && mods.length ? String(active) : '—' },
  ]

  return (
    <div className="h-full overflow-y-auto px-7 py-6">
      <h1 className="pr-12 font-display text-[40px] text-fg">Modpack</h1>
      <p className="mt-1 text-sm text-muted">
        <Versioned text="Technic Forbidden · Minecraft 1.7.10" />
      </p>

      <div className="mt-5 grid grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <GlowCard key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, ease: EASE, duration: 0.6 }} className="p-4">
            <s.icon size={16} className="relative z-[3] text-accent-strong" />
            <div className="relative z-[3] mt-3 truncate font-display text-[30px] text-accent-strong">{s.value}</div>
            <div className="relative z-[3] text-xs text-muted">{s.label}</div>
          </GlowCard>
        ))}
      </div>

      <div className="mt-5">
        <ModpackVersions />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="label">Mods do pack</h2>
          <span className="text-xs text-subtle">Exatamente o que veio no release do GitHub{off > 0 ? ` · ${off} desligado(s) pelo modo compatibilidade` : ''}</span>
        </div>
        <div className="panel rounded-2xl p-3">
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar mod…"
              className="h-10 w-full rounded-xl border border-line bg-bg/70 pl-9 pr-3 text-sm text-fg placeholder:text-subtle transition-colors focus:border-accent focus:outline-none"
            />
          </div>
          <ul className="max-h-[420px] overflow-y-auto pr-1">
            {mods === null && (
              <li className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted">
                <Loader2 size={14} className="animate-spin" /> Lendo os mods instalados…
              </li>
            )}
            {mods !== null && mods.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-subtle">
                {bridge.game ? 'O modpack ainda não foi instalado: clique em JOGAR para baixar a versão mais nova do GitHub.' : 'A lista de mods aparece no app desktop, depois de instalar o modpack.'}
              </li>
            )}
            {list.map((m, i) => (
              <motion.li
                key={m.file}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i, 40) * 0.01 }}
                title={m.file}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-overlay/[0.04]"
              >
                <span className={m.enabled ? 'truncate text-fg' : 'truncate text-subtle line-through'}>{m.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  {!m.enabled && <span className="text-[11px] text-warning">modo compatibilidade</span>}
                  {m.version && <span className="max-w-[180px] truncate font-mono text-[11px] text-muted">{m.version}</span>}
                </span>
              </motion.li>
            ))}
            {mods !== null && mods.length > 0 && list.length === 0 && <li className="px-3 py-6 text-center text-sm text-subtle">Nenhum mod encontrado.</li>}
          </ul>
        </div>
      </section>
    </div>
  )
}
