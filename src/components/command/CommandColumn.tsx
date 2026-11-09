import { motion } from 'framer-motion'
import { Home, Newspaper, Package, type LucideIcon } from 'lucide-react'
import { useUi, type Route } from '@/store/ui'
import { NEWS } from '@/lib/content'
import { audio } from '@/audio/AudioManager'
import { Logo } from '@/components/ui/Logo'
import { CommandPlay } from './CommandPlay'
import { UserBar } from './UserBar'
import { cn, EASE } from '@/lib/cn'
import { useFx } from '@/store/fx'

const NAV: { id: Route; label: string; icon: LucideIcon; badge?: number }[] = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'news', label: 'Notícias', icon: Newspaper, badge: 2 },
  { id: 'modpack', label: 'Modpack', icon: Package },
]

function NavItem({ id, label, icon: Icon, badge }: (typeof NAV)[number]) {
  const route = useUi((s) => s.route)
  const navigate = useUi((s) => s.navigate)
  const active = route === id
  return (
    <button
      aria-current={active ? 'page' : undefined}
      onMouseEnter={() => audio.play('hover')}
      onClick={() => {
        if (active) return
        audio.play('tab')
        navigate(id)
      }}
      className={cn('relative flex h-10 items-center gap-3 rounded-lg px-3 text-left transition-colors duration-300', active ? 'text-fg' : 'text-muted hover:bg-overlay/[0.04] hover:text-fg')}
    >
      {active && (
        <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-brand/55 shadow-[inset_3px_0_0_var(--accent-strong)]" transition={{ type: 'spring', stiffness: 460, damping: 36 }} />
      )}
      <Icon size={16} className={cn('relative', active && 'text-accent-strong')} />
      <span className="relative font-display text-[21px]">{label}</span>
      {badge ? (
        <span className="relative ml-auto grid h-5 min-w-5 place-items-center rounded-full border border-accent bg-brand px-1.5 text-[11px] font-semibold text-fg">{badge}</span>
      ) : null}
    </button>
  )
}

function LatestNews() {
  const navigate = useUi((s) => s.navigate)
  const n = NEWS[0]
  return (
    <button
      onMouseEnter={() => audio.play('hover')}
      onClick={() => {
        audio.play('tab')
        navigate('news')
      }}
      className="group mt-4 flex w-full flex-col items-stretch overflow-hidden rounded-2xl border border-line bg-bg text-left transition-colors hover:border-line-strong"
    >
      <span className="relative block h-16 w-full overflow-hidden">
        <img src="./brand/patch-cover.jpg" alt="" draggable={false} className="block h-full w-full object-cover transition-transform duration-700 ease-out-expo group-hover:scale-110" />
        <span className="absolute left-2.5 top-2.5 rounded-md border border-accent bg-brand px-1.5 text-[11px] font-semibold uppercase tracking-label text-fg">Novo</span>
      </span>
      <span className="flex w-full flex-col gap-1 px-3 pb-3 pt-2.5">
        <span className="font-display text-[22px] text-fg">{n.title}</span>
        <span className="text-xs text-muted">
          {n.date} · <span className="text-accent-text">Ver notas →</span>
        </span>
      </span>
    </button>
  )
}

/** Coluna de comando (formato B): marca, navegação, novidade, perfil, JOGAR e jogador. */
export function CommandColumn() {
  const introDone = useFx((s) => s.introDone)
  return (
    <motion.aside
      initial={{ x: -40, opacity: 0 }}
      animate={introDone ? { x: 0, opacity: 1 } : { x: -40, opacity: 0 }}
      transition={{ duration: 0.8, ease: EASE }}
      className="panel relative z-30 flex h-full w-[288px] shrink-0 flex-col border-y-0 border-l-0 !border-r-accent/40 px-[18px] pb-4 pt-[22px] shadow-[1px_0_24px_-8px_var(--accent)]"
    >
      <div className="drag flex items-center gap-2.5 px-1">
        <Logo variant="mark" size={38} pulse />
        <Logo variant="wordmark" size={19} />
      </div>

      <nav className="mt-6 flex flex-col gap-0.5" aria-label="Navegação principal">
        {NAV.map((item) => (
          <NavItem key={item.id} {...item} />
        ))}
      </nav>

      <LatestNews />

      <div className="flex-1" />

      <CommandPlay />
      <UserBar />
    </motion.aside>
  )
}
