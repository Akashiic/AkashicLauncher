import { motion } from 'framer-motion'
import { ArrowUpRight, Calendar } from 'lucide-react'
import { NEWS } from '@/lib/content'
import { GlowCard } from '@/components/ui/GlowCard'
import { useUi } from '@/store/ui'
import { audio } from '@/audio/AudioManager'
import { EASE } from '@/lib/cn'
import { TONE_VAR } from '@/theme'

export function NewsCards() {
  const navigate = useUi((s) => s.navigate)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {NEWS.slice(0, 3).map((n, i) => (
        <GlowCard
          key={n.id}
          glow={TONE_VAR[n.accent]}
          initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.15 + i * 0.07, duration: 0.7, ease: EASE }}
          whileHover={{ y: -4 }}
          onMouseEnter={() => audio.play('hover')}
          onClick={() => {
            audio.play('tab')
            navigate('news')
          }}
          className="group cursor-pointer overflow-hidden p-0"
          role="button"
          tabIndex={0}
        >
          <div className="relative h-24 overflow-hidden rounded-t-2xl">
            <div className="absolute inset-0" style={{ background: `radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, ${TONE_VAR[n.accent]} 40%, transparent), transparent 65%), linear-gradient(135deg, var(--surface-2), var(--bg-base))` }} />
            {/* padrão de blocos */}
            <div className="absolute inset-0 opacity-60 transition-transform duration-700 ease-out-expo group-hover:scale-110" style={{ backgroundImage: 'linear-gradient(var(--border-strong) 1px, transparent 1px), linear-gradient(90deg, var(--border-strong) 1px, transparent 1px)', backgroundSize: '16px 16px', maskImage: 'linear-gradient(120deg, var(--shade), transparent 70%)' }} />
            <span className="absolute left-4 top-3 rounded-md border border-line-strong bg-bg/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-fg backdrop-blur">{n.tag}</span>
            {n.version && <span className="absolute right-4 top-3 font-mono text-[11px] text-muted">v{n.version}</span>}
          </div>
          <div className="relative z-[3] p-4">
            <h3 className="font-display text-[24px] text-fg">{n.title}</h3>
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{n.excerpt}</p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-subtle">
              <span className="flex items-center gap-1.5">
                <Calendar size={11} /> {n.date}
              </span>
              <motion.span className="flex items-center gap-1 text-muted transition-colors group-hover:text-fg">
                Ler mais <ArrowUpRight size={12} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </motion.span>
            </div>
          </div>
        </GlowCard>
      ))}
    </div>
  )
}
