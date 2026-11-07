import { motion } from 'framer-motion'
import { Gauge, Eye, Volume2, Wrench, AlertTriangle, Map } from 'lucide-react'
import { OPTIONAL_MODS, useSettings, type Minimap } from '@/store/settings'
import { Switch } from '@/components/ui/Switch'
import { Segmented } from '@/components/ui/Segmented'
import { toast } from '@/store/toasts'
import { cn, EASE } from '@/lib/cn'

const TAG_ICON = { Performance: Gauge, Visual: Eye, 'Áudio': Volume2, Utilidade: Wrench }
const IMPACT = { baixo: 'text-success', 'médio': 'text-warning', alto: 'text-danger-text' }

export function OptionalModsList() {
  const mods = useSettings((s) => s.settings.optionalMods)
  const minimap = useSettings((s) => s.settings.minimap)
  const toggleMod = useSettings((s) => s.toggleMod)
  const update = useSettings((s) => s.update)
  const shadersWithoutRenderer = mods.shaders && !mods.optifine && !mods.angelica

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-bg/60 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-fg">
            <Map size={18} />
          </span>
          <div>
            <div className="text-sm font-semibold text-fg">Minimapa</div>
            <div className="text-xs text-muted">Escolha apenas um — os dois juntos conflitam na 1.7.10.</div>
          </div>
        </div>
        <Segmented<Minimap>
          size="sm"
          value={minimap}
          onChange={(v) => update({ minimap: v })}
          options={[
            { value: 'journeymap', label: 'JourneyMap' },
            { value: 'voxelmap', label: 'VoxelMap' },
            { value: 'none', label: 'Nenhum' },
          ]}
        />
      </div>

      {shadersWithoutRenderer && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex items-center gap-2 rounded-xl border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle size={14} /> Shaders Support precisa de OptiFine ou Angelica ativados.
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
        {OPTIONAL_MODS.map((m, i) => {
          const Icon = TAG_ICON[m.tag]
          const on = !!mods[m.id]
          return (
            <motion.label
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.035, duration: 0.45, ease: EASE }}
              className={cn(
                'flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition-colors duration-300',
                on ? 'border-accent/60 bg-brand/30' : 'border-line bg-bg/60 hover:bg-overlay/[0.03]',
              )}
            >
              <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors', on ? 'bg-brand text-fg' : 'bg-overlay/[0.05] text-subtle')}>
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-fg">{m.name}</span>
                  <span className="rounded border border-line px-1.5 text-[11px] text-muted">{m.tag}</span>
                  <span className={cn('text-[11px]', IMPACT[m.impact])}>impacto {m.impact}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">{m.desc}</span>
              </span>
              <Switch
                checked={on}
                label={m.name}
                onChange={() => {
                  const disabled = toggleMod(m.id)
                  if (disabled.length) toast({ kind: 'warning', title: 'Conflito resolvido', body: `${disabled.join(', ')} foi desativado para evitar incompatibilidade com ${m.name}.` })
                }}
              />
            </motion.label>
          )
        })}
      </div>
    </div>
  )
}
