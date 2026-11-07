import { Monitor, MonitorSmartphone, Maximize, AppWindow, ArrowDownToLine, PanelTop, Power, FolderOpen, ScrollText, ShieldCheck } from 'lucide-react'
import { useSettings, type LaunchBehavior, type Resolution } from '@/store/settings'
import { useLaunch } from '@/store/launch'
import { useUi } from '@/store/ui'
import { bridge } from '@/lib/bridge'
import { toast } from '@/store/toasts'
import { audio } from '@/audio/AudioManager'
import { Section } from './SettingRow'
import { GlowCard } from '@/components/ui/GlowCard'
import { cn } from '@/lib/cn'

const RES: { value: Resolution; label: string; sub: string; icon: typeof Monitor }[] = [
  { value: '1080p', label: '1920 × 1080', sub: 'Full HD janela', icon: Monitor },
  { value: '720p', label: '1280 × 720', sub: 'HD janela', icon: MonitorSmartphone },
  { value: 'fullscreen', label: 'Tela cheia', sub: 'Exclusiva', icon: Maximize },
  { value: 'borderless', label: 'Sem bordas', sub: 'Janela borderless', icon: AppWindow },
]

const BEHAVIOR: { value: LaunchBehavior; label: string; sub: string; icon: typeof Monitor }[] = [
  { value: 'tray', label: 'Minimizar para a bandeja', sub: 'Recomendado — economiza recursos', icon: ArrowDownToLine },
  { value: 'keep', label: 'Manter aberto', sub: 'Útil para ver logs', icon: PanelTop },
  { value: 'close', label: 'Fechar launcher', sub: 'Libera toda a memória', icon: Power },
]

function OptionCard<T extends string>({ active, onClick, icon: Icon, label, sub }: { active: boolean; onClick: () => void; icon: typeof Monitor; label: string; sub: string; value?: T }) {
  return (
    <button
      onMouseEnter={() => audio.play('hover')}
      onClick={() => {
        if (!active) audio.play('toggleOn')
        onClick()
      }}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-300',
        active ? 'border-aether-400/40 bg-aether-500/10 shadow-[0_0_24px_-8px_rgba(124,92,255,.7)]' : 'border-white/[0.07] bg-black/20 hover:border-white/15',
      )}
    >
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', active ? 'bg-aether-500/20 text-aether-200' : 'bg-white/[0.04] text-slate-500')}>
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="block text-[11px] text-slate-400">{sub}</span>
      </span>
      <span className={cn('ml-auto h-4 w-4 shrink-0 rounded-full border-2 transition-all', active ? 'border-aether-300 bg-aether-400 shadow-[0_0_10px_rgba(124,92,255,.9)]' : 'border-white/20')} />
    </button>
  )
}

export function GameTab() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  const verifyOnly = useLaunch((st) => st.verifyOnly)
  const setLogsOpen = useUi((st) => st.setLogsOpen)

  const actions = [
    {
      icon: FolderOpen,
      label: 'Abrir pasta do modpack',
      sub: '.minecraft',
      run: async () => {
        audio.play('click')
        const dir = await bridge.shell.openGameDir()
        toast({ kind: 'info', title: 'Pasta do modpack', body: dir })
      },
    },
    { icon: ScrollText, label: 'Ver logs em tempo real', sub: 'latest.log', run: () => (audio.play('open'), setLogsOpen(true)) },
    { icon: ShieldCheck, label: 'Verificar integridade', sub: 'SHA-1 de 1284 arquivos', run: verifyOnly },
  ]

  return (
    <div className="space-y-4">
      <Section title="Resolução da janela" desc="Tamanho com que o Minecraft abre.">
        <div className="grid grid-cols-2 gap-2">
          {RES.map((r) => (
            <OptionCard key={r.value} active={s.resolution === r.value} onClick={() => update({ resolution: r.value })} icon={r.icon} label={r.label} sub={r.sub} />
          ))}
        </div>
      </Section>

      <Section title="Ao iniciar o jogo" desc="O que o launcher faz enquanto você joga.">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          {BEHAVIOR.map((b) => (
            <OptionCard key={b.value} active={s.launchBehavior === b.value} onClick={() => update({ launchBehavior: b.value })} icon={b.icon} label={b.label} sub={b.sub} />
          ))}
        </div>
      </Section>

      <Section title="Ferramentas rápidas">
        <div className="grid grid-cols-3 gap-2">
          {actions.map((a) => (
            <GlowCard key={a.label} role="button" tabIndex={0} onMouseEnter={() => audio.play('hover')} onClick={a.run} whileTap={{ scale: 0.97 }} className="cursor-pointer p-4">
              <a.icon size={18} className="relative z-[3] text-rune-300" />
              <div className="relative z-[3] mt-3 text-sm font-semibold text-white">{a.label}</div>
              <div className="relative z-[3] font-mono text-[11px] text-slate-500">{a.sub}</div>
            </GlowCard>
          ))}
        </div>
      </Section>
    </div>
  )
}
