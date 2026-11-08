import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, XOctagon, Coffee, FolderSearch, Zap, Scale, Feather, Pencil, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { JVM_PRESETS, useSettings, type JvmPreset } from '@/store/settings'
import { JAVA_RUNTIME, javaLabel } from '@/lib/java'
import { Switch } from '@/components/ui/Switch'
import { Slider } from '@/components/ui/Slider'
import { Button } from '@/components/ui/Button'
import { Section } from './SettingRow'
import { toast } from '@/store/toasts'
import { audio } from '@/audio/AudioManager'
import { cn, EASE } from '@/lib/cn'
import { TONE_VAR } from '@/theme'

/** Faixas pensadas para Java 8 + Forge 1.7.10. */
function ramVerdict(gb: number) {
  if (gb < 4) return { level: 'low', icon: AlertTriangle, text: 'Pouca memória — o modpack pode travar ou crashar ao carregar mundos.', cls: 'text-warning border-warning/30 bg-warning/10', tone: TONE_VAR.warning }
  if (gb <= 6) return { level: 'ideal', icon: CheckCircle2, text: 'Ideal para 1.7.10. Faixa de melhor desempenho do Garbage Collector do Java 8.', cls: 'text-success border-success/30 bg-success/10', tone: TONE_VAR.success }
  if (gb <= 10) return { level: 'high', icon: AlertTriangle, text: 'Alto. Funciona, mas pausas de GC ficam mais longas — só use com shaders ou muitos mods extras.', cls: 'text-warning border-warning/30 bg-warning/10', tone: TONE_VAR.warning }
  return { level: 'excess', icon: XOctagon, text: 'Excessivo para o Java 8. Heaps gigantes causam travadas de vários segundos (stop-the-world).', cls: 'text-danger-text border-danger/40 bg-danger/10', tone: TONE_VAR.danger }
}

export function PerformanceTab() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  const [checking, setChecking] = useState(false)
  const v = ramVerdict(s.memoryGb)
  const systemRam = 16

  // verificação do runtime incluso (simulada)
  const checkRuntime = () => {
    setChecking(true)
    window.setTimeout(() => {
      setChecking(false)
      audio.play('success')
      toast({ kind: 'success', title: 'Java íntegro', body: `${javaLabel} · ${JAVA_RUNTIME.arch} — pronto para o Forge 1.7.10.` })
    }, 1200)
  }

  return (
    <div className="space-y-4">
      <Section title="Alocação de Memória RAM" desc={`Quanta memória o Minecraft pode usar. Seu PC tem ${systemRam} GB.`}>
        <div className="flex items-end justify-between">
          <div className="font-display text-[52px] tabular-nums text-accent-strong">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={s.memoryGb} initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="inline-block">
                {s.memoryGb}
              </motion.span>
            </AnimatePresence>
            <span className="ml-1 text-lg text-muted">GB</span>
          </div>
          <span className="font-mono text-xs text-subtle">-Xmx{s.memoryGb}G</span>
        </div>
        <div className="mt-4">
          <Slider
            label="Memória RAM em GB"
            min={2}
            max={16}
            value={s.memoryGb}
            onChange={(memoryGb) => update({ memoryGb })}
            tone={v.tone}
            marks={[2, 4, 6, 8, 10, 12, 14, 16]}
            formatMark={(m) => `${m}G`}
            zones={[
              { from: 2, to: 4, className: 'bg-warning' },
              { from: 4, to: 6, className: 'bg-success' },
              { from: 6, to: 10, className: 'bg-warning' },
              { from: 10, to: 16, className: 'bg-danger' },
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
              className={cn('rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors', s.memoryGb === gb ? 'border-accent bg-brand/15 text-fg' : 'border-line text-muted hover:text-fg')}
            >
              {gb} GB {gb === 6 && '· recomendado'}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Java" desc="O launcher traz o próprio Java 8, o mesmo para todos os jogadores. Você não precisa instalar nada.">
        <div className="flex items-center gap-4 rounded-xl border border-success/30 bg-bg/70 px-4 py-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-accent bg-brand text-fg">
            <Coffee size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-fg">
                {JAVA_RUNTIME.vendor} · {JAVA_RUNTIME.name}
              </span>
              <span className="rounded border border-line px-1.5 font-mono text-[11px] text-muted">{JAVA_RUNTIME.version}</span>
              <span className="rounded border border-line px-1.5 text-[11px] text-muted">{JAVA_RUNTIME.arch}</span>
              <span className={cn('flex items-center gap-1 text-xs', s.javaMode === 'bundled' ? 'text-success' : 'text-subtle')}>
                <CheckCircle2 size={12} /> {s.javaMode === 'bundled' ? 'Em uso · incluso no launcher' : 'Incluso no launcher (não está em uso)'}
              </span>
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-subtle" title={JAVA_RUNTIME.executable}>
              {JAVA_RUNTIME.executable}
            </div>
          </div>
          <Button size="sm" icon={<ShieldCheck size={13} className={cn(checking && 'animate-pulse')} />} onClick={checkRuntime} disabled={checking}>
            {checking ? 'Verificando…' : 'Verificar'}
          </Button>
        </div>

        <div className="mt-3 rounded-xl border border-line bg-bg/40">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-fg">Usar outro Java (avançado)</div>
              <div className="text-xs text-muted">Só para quem sabe o que está fazendo. O Zulu incluso é o recomendado.</div>
            </div>
            <Switch checked={s.javaMode === 'custom'} label="Usar outro Java" onChange={(on) => update({ javaMode: on ? 'custom' : 'bundled' })} />
          </div>
          <AnimatePresence initial={false}>
            {s.javaMode === 'custom' && (
              <motion.div key="custom" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
                <div className="border-t border-line px-4 pb-4 pt-3">
                  <div className="flex gap-2">
                    <input
                      value={s.javaPath}
                      onChange={(e) => update({ javaPath: e.target.value })}
                      placeholder="C:\Program Files\Java\jre1.8.0\bin\javaw.exe"
                      spellCheck={false}
                      aria-label="Caminho do Java"
                      className="h-10 flex-1 rounded-xl border border-line bg-bg/70 px-3 font-mono text-xs text-fg placeholder:text-subtle focus:border-accent focus:outline-none"
                    />
                    <Button size="md" icon={<FolderSearch size={14} />} onClick={() => toast({ kind: 'info', title: 'Seletor de arquivo', body: 'Abriria o diálogo nativo (mock).' })}>
                      Procurar
                    </Button>
                  </div>
                  <div className="mt-2 flex items-start gap-2 text-xs text-warning">
                    <AlertTriangle size={13} className="mt-px shrink-0" />
                    <span>A 1.7.10 só roda em Java 8. Java 11, 17 ou mais novo faz o Forge crashar ao abrir. {!s.javaPath.trim() && 'Sem caminho, o launcher continua usando o Zulu incluso.'}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
                  active ? 'border-accent bg-brand/40 shadow-glow' : 'border-line bg-bg/60 hover:border-line-strong',
                )}
              >
                <Icon size={16} className={active ? 'text-accent-strong' : 'text-subtle'} />
                <div className="mt-2 text-sm font-semibold text-fg">{p.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted">{p.hint}</div>
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
            className="w-full resize-none rounded-xl border border-line bg-bg/70 p-3 font-mono text-[11px] leading-relaxed text-muted focus:border-accent focus:outline-none"
          />
          {s.jvmPreset === 'custom' && (
            <span className="absolute right-3 top-2 flex items-center gap-1 text-[11px] text-warning">
              <Pencil size={10} /> personalizado
            </span>
          )}
        </div>
      </Section>
    </div>
  )
}
