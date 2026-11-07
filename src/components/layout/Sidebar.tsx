import { motion } from 'framer-motion'
import { Home, Package, Newspaper, Settings } from 'lucide-react'
import { useUi, type Route } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { useLaunch } from '@/store/launch'
import { audio } from '@/audio/AudioManager'
import { Logo } from '@/components/ui/Logo'
import { Tooltip } from '@/components/ui/Tooltip'
import { PlayerHead } from '@/components/ui/PlayerHead'
import { cn } from '@/lib/cn'

const NAV: { id: Route; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Início · Jogar', icon: Home },
  { id: 'modpack', label: 'Modpack & Opcionais', icon: Package },
  { id: 'news', label: 'Changelog & Notícias', icon: Newspaper },
  { id: 'settings', label: 'Configurações', icon: Settings },
]

export function Sidebar() {
  const route = useUi((s) => s.route)
  const navigate = useUi((s) => s.navigate)
  const nickname = useSettings((s) => s.settings.nickname)
  const running = useLaunch((s) => s.phase === 'running')

  return (
    <aside className="glass relative z-30 flex w-[76px] shrink-0 flex-col items-center border-y-0 border-l-0 py-5">
      <Tooltip content="Akashic Network" side="right">
        <button
          aria-label="Início"
          onMouseEnter={() => audio.play('hover')}
          onClick={() => {
            audio.play('chime')
            navigate('home')
          }}
        >
          <Logo size={42} />
        </button>
      </Tooltip>

      <div className="my-6 h-px w-8 bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <nav className="flex flex-1 flex-col items-center gap-2">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = route === id
          return (
            <Tooltip key={id} content={label} side="right">
              <motion.button
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                whileTap={{ scale: 0.9 }}
                onMouseEnter={() => audio.play('hover')}
                onClick={() => {
                  if (active) return
                  audio.play(id === 'settings' ? 'open' : 'tab')
                  navigate(id)
                }}
                className={cn(
                  'relative grid h-12 w-12 place-items-center rounded-xl transition-colors duration-300',
                  active ? 'text-white' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200',
                )}
              >
                {active && (
                  <>
                    <motion.span
                      layoutId="nav-active-bg"
                      className="absolute inset-0 rounded-xl border border-aether-400/30 bg-gradient-to-br from-aether-500/25 to-rune-500/10 shadow-[0_0_24px_-4px_rgba(124,92,255,.6)]"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                    <motion.span
                      layoutId="nav-active-bar"
                      className="absolute -left-[14px] top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-aether-300 to-rune-400 shadow-[0_0_12px_2px_rgba(124,92,255,.8)]"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  </>
                )}
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} className="relative" />
              </motion.button>
            </Tooltip>
          )
        })}
      </nav>

      <Tooltip
        side="right"
        content={
          <span className="flex flex-col">
            <span className="font-semibold">{nickname}</span>
            <span className="text-[10px] text-slate-400">{running ? 'Jogando · Akashic Survival' : 'Online no launcher'}</span>
          </span>
        }
      >
        <button
          aria-label="Perfil"
          onMouseEnter={() => audio.play('hover')}
          onClick={() => audio.play('click')}
          className="relative rounded-xl border border-white/10 bg-white/[0.04] p-1.5 transition-colors hover:border-aether-400/40"
        >
          <motion.div animate={{ y: [0, -2, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} className="[transform-style:preserve-3d]">
            <div className="[transform:perspective(120px)_rotateY(-14deg)_rotateX(6deg)] drop-shadow-[2px_4px_6px_rgba(0,0,0,.6)]">
              <PlayerHead name={nickname} size={34} />
            </div>
          </motion.div>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center">
            <span className={cn('absolute h-full w-full rounded-full pulse-ring', running ? 'bg-ember-400' : 'bg-emerald-400')} />
            <span className={cn('relative h-2.5 w-2.5 rounded-full border-2 border-void-800', running ? 'bg-ember-400' : 'bg-emerald-400')} />
          </span>
        </button>
      </Tooltip>
    </aside>
  )
}
