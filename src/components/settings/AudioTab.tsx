import { Volume2, VolumeX, Music2, MousePointerClick, Wind, Leaf, Play, RotateCcw, FileJson, Sparkles } from 'lucide-react'
import { useSettings } from '@/store/settings'
import type { AudioSettings } from '@/audio/AudioManager'
import { audio } from '@/audio/AudioManager'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { Button } from '@/components/ui/Button'
import { Section, Row } from './SettingRow'
import { toast } from '@/store/toasts'
import { cn } from '@/lib/cn'

const CHANNELS: { key: keyof AudioSettings; label: string; desc: string; icon: typeof Music2; test: () => void }[] = [
  { key: 'master', label: 'Geral', desc: 'Volume mestre de todo o launcher', icon: Volume2, test: () => audio.play('chime') },
  { key: 'bgm', label: 'Música (BGM)', desc: 'Trilha ambiente do launcher', icon: Music2, test: () => audio.startBgm(1) },
  { key: 'sfx', label: 'Efeitos de interface (SFX)', desc: 'Hover, cliques, switches e sliders', icon: MousePointerClick, test: () => audio.play('click') },
  { key: 'sbfx', label: 'Ambiência & impacto (SBFX)', desc: 'Vento, atmosfera e efeito do botão Jogar', icon: Wind, test: () => audio.play('play') },
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
                  className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors', ch.muted ? 'border-line bg-overlay/[0.03] text-subtle' : 'border-line bg-overlay/[0.06] text-fg')}
                >
                  {ch.muted ? <VolumeX size={16} /> : <c.icon size={16} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-fg">{c.label}</span>
                      <span className="ml-2 text-[11px] text-subtle">{c.desc}</span>
                    </div>
                    <span className="font-mono text-xs text-muted">{ch.muted ? 'mudo' : `${Math.round(ch.volume * 100)}%`}</span>
                  </div>
                  <Slider label={`Volume ${c.label}`} min={0} max={100} value={Math.round(ch.volume * 100)} onChange={(v) => setAudio(c.key, { volume: v / 100, muted: false })} disabled={ch.muted} />
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
            <Leaf size={16} className={s.ecoMode ? 'text-success' : 'text-subtle'} />
            <Switch checked={s.ecoMode} label="Modo economia" onChange={(ecoMode) => update({ ecoMode })} />
          </div>
        </Row>
        <Row title="Seguir as animações do Windows" desc="Com os efeitos de animação desligados no Windows, o launcher também fica sem movimento. Desligue para manter as animações do launcher.">
          <div className="flex items-center gap-3">
            <Sparkles size={16} className={s.followSystemMotion ? 'text-subtle' : 'text-accent-strong'} />
            <Switch checked={s.followSystemMotion} label="Seguir as animações do Windows" onChange={(followSystemMotion) => update({ followSystemMotion })} />
          </div>
        </Row>
      </Section>

      <Section title="Dados">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
            <FileJson size={14} className="shrink-0 text-accent-strong" />
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
