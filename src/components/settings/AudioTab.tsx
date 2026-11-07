import { Volume2, VolumeX, Music2, MousePointerClick, Wind, Leaf, Play, RotateCcw, FileJson } from 'lucide-react'
import { useSettings } from '@/store/settings'
import type { AudioSettings } from '@/audio/AudioManager'
import { audio } from '@/audio/AudioManager'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { Button } from '@/components/ui/Button'
import { Section, Row } from './SettingRow'
import { toast } from '@/store/toasts'
import { cn } from '@/lib/cn'

const CHANNELS: { key: keyof AudioSettings; label: string; desc: string; icon: typeof Music2; color: string; glow: string; test: () => void }[] = [
  { key: 'master', label: 'Geral', desc: 'Volume mestre de todo o launcher', icon: Volume2, color: 'from-slate-300 to-white', glow: 'rgba(255,255,255,.5)', test: () => audio.play('chime') },
  { key: 'bgm', label: 'Música (BGM)', desc: 'Trilha ambiente do launcher', icon: Music2, color: 'from-aether-500 to-aether-300', glow: 'rgba(124,92,255,.7)', test: () => audio.startBgm(1) },
  { key: 'sfx', label: 'Efeitos de interface (SFX)', desc: 'Hover, cliques, switches e sliders', icon: MousePointerClick, color: 'from-rune-500 to-rune-300', glow: 'rgba(63,224,208,.7)', test: () => audio.play('click') },
  { key: 'sbfx', label: 'Ambiência & impacto (SBFX)', desc: 'Vento, atmosfera e efeito do botão Jogar', icon: Wind, color: 'from-ember-500 to-ember-400', glow: 'rgba(255,149,51,.7)', test: () => audio.play('play') },
]

export function AudioTab() {
  const s = useSettings((st) => st.settings)
  const setAudio = useSettings((st) => st.setAudio)
  const update = useSettings((st) => st.update)
  const reset = useSettings((st) => st.reset)
  const savedPath = useSettings((st) => st.savedPath)

  return (
    <div className="space-y-4">
      <Section title="Volumes" desc="Cada canal é independente. O ícone silencia só aquele canal.">
        <div className="space-y-5">
          {CHANNELS.map((c) => {
            const ch = s.audio[c.key]
            return (
              <div key={c.key} className="flex items-center gap-4">
                <button
                  aria-label={ch.muted ? `Ativar ${c.label}` : `Silenciar ${c.label}`}
                  onMouseEnter={() => audio.play('hover')}
                  onClick={() => {
                    audio.play(ch.muted ? 'toggleOn' : 'toggleOff')
                    setAudio(c.key, { muted: !ch.muted })
                  }}
                  className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors', ch.muted ? 'border-white/10 bg-white/[0.03] text-slate-600' : 'border-white/10 bg-white/[0.06] text-white')}
                >
                  {ch.muted ? <VolumeX size={16} /> : <c.icon size={16} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-white">{c.label}</span>
                      <span className="ml-2 text-[11px] text-slate-500">{c.desc}</span>
                    </div>
                    <span className="font-mono text-xs text-slate-300">{ch.muted ? 'mudo' : `${Math.round(ch.volume * 100)}%`}</span>
                  </div>
                  <Slider label={`Volume ${c.label}`} min={0} max={100} value={Math.round(ch.volume * 100)} onChange={(v) => setAudio(c.key, { volume: v / 100, muted: false })} color={c.color} glow={c.glow} disabled={ch.muted} />
                </div>
                <Button size="sm" variant="ghost" icon={<Play size={12} />} onClick={c.test} sound={null} aria-label={`Testar ${c.label}`}>
                  Testar
                </Button>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="Estética do launcher">
        <Row title="Modo Economia de Recursos" desc="Desativa partículas em canvas, parallax e reduz o blur. Ideal para PCs mais fracos.">
          <div className="flex items-center gap-3">
            <Leaf size={16} className={s.ecoMode ? 'text-emerald-400' : 'text-slate-600'} />
            <Switch checked={s.ecoMode} label="Modo economia" onChange={(ecoMode) => update({ ecoMode })} />
          </div>
        </Row>
      </Section>

      <Section title="Dados">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2 text-xs text-slate-400">
            <FileJson size={14} className="shrink-0 text-rune-300" />
            <span className="truncate font-mono">{savedPath}</span>
          </div>
          <Button
            size="sm"
            variant="danger"
            icon={<RotateCcw size={13} />}
            onClick={() => {
              reset()
              toast({ kind: 'info', title: 'Configurações restauradas', body: 'Todos os valores voltaram ao padrão.' })
            }}
          >
            Restaurar padrões
          </Button>
        </div>
      </Section>
    </div>
  )
}
