import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, XOctagon, Coffee, FolderSearch, Zap, Scale, Feather, Pencil, Search } from 'lucide-react'
import { useState } from 'react'
import { JVM_PRESETS, useSettings, type JvmPreset } from '@/store/settings'
import { Slider } from '@/components/ui/Slider'
import { Segmented } from '@/components/ui/Segmented'
import { Button } from '@/components/ui/Button'
import { Section } from './SettingRow'
import { toast } from '@/store/toasts'
import { audio } from '@/audio/AudioManager'
import { cn, EASE } from '@/lib/cn'

/** Faixas pensadas para Java 8 + Forge 1.7.10. */
function ramVerdict(gb: number) {
  if (gb < 4) return { level: 'low', icon: AlertTriangle, text: 'Pouca memória — o modpack pode travar ou crashar ao carregar mundos.', cls: 'text-amber-300 border-amber-400/25 bg-amber-400/10', glow: 'rgba(251,191,36,.7)', color: 'from-amber-500 to-amber-300' }
  if (gb <= 6) return { level: 'ideal', icon: CheckCircle2, text: 'Ideal para 1.7.10. Faixa de melhor desempenho do Garbage Collector do Java 8.', cls: 'text-emerald-300 border-emerald-400/25 bg-emerald-400/10', glow: 'rgba(52,211,153,.7)', color: 'from-emerald-500 to-rune-400' }
  if (gb <= 10) return { level: 'high', icon: AlertTriangle, text: 'Alto. Funciona, mas pausas de GC ficam mais longas — só use com shaders ou muitos mods extras.', cls: 'text-amber-300 border-amber-400/25 bg-amber-400/10', glow: 'rgba(251,191,36,.7)', color: 'from-emerald-500 via-amber-400 to-amber-300' }
  return { level: 'excess', icon: XOctagon, text: 'Excessivo para o Java 8. Heaps gigantes causam travadas de vários segundos (stop-the-world).', cls: 'text-rose-300 border-rose-400/25 bg-rose-400/10', glow: 'rgba(251,113,133,.75)', color: 'from-emerald-500 via-amber-400 to-rose-400' }
}

export function PerformanceTab() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  const [detecting, setDetecting] = useState(false)
  const v = ramVerdict(s.memoryGb)
  const systemRam = 16

  const detectJava = () => {
    setDetecting(true)
    window.setTimeout(() => {
      setDetecting(false)
      audio.play('success')
      update({ javaMode: 'auto' })
      toast({ kind: 'success', title: 'Java 8 detectado', body: 'Java HotSpot 1.8.0_421 (64-bit) — compatível com Forge 1.7.10.' })
    }, 1400)
  }

  return (
    <div className="space-y-4">
      <Section title="Alocação de Memória RAM" desc={`Quanta memória o Minecraft pode usar. Seu PC tem ${systemRam} GB.`}>
        <div className="flex items-end justify-between">
          <div className="font-display text-4xl font-bold tabular-nums text-white">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={s.memoryGb} initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="inline-block">
                {s.memoryGb}
              </motion.span>
            </AnimatePresence>
            <span className="ml-1 text-lg text-slate-400">GB</span>
          </div>
          <span className="font-mono text-xs text-slate-500">-Xmx{s.memoryGb}G</span>
        </div>
        <div className="mt-4">
          <Slider
            label="Memória RAM em GB"
            min={2}
            max={16}
            value={s.memoryGb}
            onChange={(memoryGb) => update({ memoryGb })}
            color={v.color}
            glow={v.glow}
            marks={[2, 4, 6, 8, 10, 12, 14, 16]}
            formatMark={(m) => `${m}G`}
            zones={[
              { from: 2, to: 4, className: 'bg-amber-400' },
              { from: 4, to: 6, className: 'bg-emerald-400' },
              { from: 6, to: 10, className: 'bg-amber-400' },
              { from: 10, to: 16, className: 'bg-rose-500' },
            ]}
          />
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={v.level} initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }} className={cn('mt-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed', v.cls)}>
            <v.icon size={15} className="mt-px shrink-0" />
            <span>{v.text}</span>
          </motion.div>
        </AnimatePresence>
        <div className="mt-3 flex gap-2">
          {[4, 6, 8].map((gb) => (
            <button
              key={gb}
              onMouseEnter={() => audio.play('hover')}
              onClick={() => {
                audio.play('tick', { pitch: 0.8 + gb / 20 })
                update({ memoryGb: gb })
              }}
              className={cn('rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors', s.memoryGb === gb ? 'border-aether-400/40 bg-aether-500/15 text-white' : 'border-white/10 text-slate-400 hover:text-white')}
            >
              {gb} GB {gb === 6 && '· recomendado'}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Java" desc="A 1.7.10 exige Java 8 (1.8.x). Versões mais novas não funcionam com Forge desta época.">
        <Segmented
          value={s.javaMode}
          onChange={(javaMode) => update({ javaMode })}
          options={[
            { value: 'auto', label: 'Auto-detectar Java 8', icon: <Coffee size={14} /> },
            { value: 'custom', label: 'Caminho personalizado', icon: <FolderSearch size={14} /> },
          ]}
        />
        <AnimatePresence mode="wait" initial={false}>
          {s.javaMode === 'auto' ? (
            <motion.div key="auto" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
              <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.07] bg-black/30 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 text-sm text-white">
                    <CheckCircle2 size={14} className="text-emerald-400" /> Java HotSpot 1.8.0_421 · 64-bit
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-500">C:\Program Files\Java\jre1.8.0_421\bin\javaw.exe</div>
                </div>
                <Button size="sm" icon={<Search size={13} className={cn(detecting && 'animate-pulse')} />} onClick={detectJava} disabled={detecting}>
                  {detecting ? 'Procurando…' : 'Detectar novamente'}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="custom" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
              <div className="mt-4 flex gap-2">
                <input
                  value={s.javaPath}
                  onChange={(e) => update({ javaPath: e.target.value })}
                  placeholder="C:\Program Files\Java\jre1.8.0\bin\javaw.exe"
                  spellCheck={false}
                  className="h-10 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 font-mono text-xs text-white placeholder:text-slate-600 focus:border-aether-400/50 focus:outline-none"
                />
                <Button size="md" icon={<FolderSearch size={14} />} onClick={() => toast({ kind: 'info', title: 'Seletor de arquivo', body: 'Abriria o diálogo nativo (mock).' })}>
                  Procurar
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      <Section title="Argumentos da JVM" desc="Escolha um preset pronto ou edite manualmente se souber o que está fazendo.">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['fps', Zap],
              ['default', Scale],
              ['low', Feather],
            ] as const
          ).map(([key, Icon]) => {
            const p = JVM_PRESETS[key]
            const active = s.jvmPreset === key
            return (
              <button
                key={key}
                onMouseEnter={() => audio.play('hover')}
                onClick={() => {
                  audio.play('toggleOn')
                  update({ jvmPreset: key, jvmArgs: p.args })
                }}
                className={cn(
                  'rounded-xl border p-3 text-left transition-all duration-300',
                  active ? 'border-aether-400/40 bg-aether-500/10 shadow-[0_0_24px_-8px_rgba(124,92,255,.7)]' : 'border-white/[0.07] bg-black/20 hover:border-white/15',
                )}
              >
                <Icon size={16} className={active ? 'text-aether-300' : 'text-slate-500'} />
                <div className="mt-2 text-sm font-semibold text-white">{p.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{p.hint}</div>
              </button>
            )
          })}
        </div>
        <div className="relative mt-3">
          <textarea
            value={s.jvmArgs}
            spellCheck={false}
            onChange={(e) => update({ jvmArgs: e.target.value, jvmPreset: 'custom' as JvmPreset })}
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-rune-300 focus:border-aether-400/50 focus:outline-none"
          />
          {s.jvmPreset === 'custom' && (
            <span className="absolute right-3 top-2 flex items-center gap-1 text-[10px] text-amber-300">
              <Pencil size={10} /> personalizado
            </span>
          )}
        </div>
      </Section>
    </div>
  )
}
