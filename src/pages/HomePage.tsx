import { motion } from 'framer-motion'
import { Sparkles, Swords, Trophy } from 'lucide-react'
import { ServerStatus } from '@/components/home/ServerStatus'
import { NewsCards } from '@/components/home/NewsCards'
import { ActionBar } from '@/components/home/ActionBar'
import { GlowCard } from '@/components/ui/GlowCard'
import { useSettings } from '@/store/settings'
import { EASE } from '@/lib/cn'

export function HomePage() {
  const nickname = useSettings((s) => s.settings.nickname)
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-8 pb-6 pt-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
          {/* Hero */}
          <div className="flex flex-col justify-end">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-aether-400/30 bg-aether-500/10 px-3 py-1 text-[11px] font-semibold text-aether-200">
                <Sparkles size={12} /> Patch 3.4 disponível
              </span>
              <span className="text-xs text-slate-500">Bem-vindo de volta, {nickname}</span>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.05, duration: 0.9, ease: EASE }}
              className="mt-4 font-display text-[54px] font-bold leading-[1.02] tracking-tight"
            >
              <span className="text-gradient">Ecos do Vazio</span>
              <br />
              <span className="text-white/90">aguardam você.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.8 }} className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
              Modpack 1.7.10 com magia, tecnologia e exploração. Nova dimensão flutuante, chefes inéditos e progressão de quests reformulada.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.7, ease: EASE }} className="mt-6 flex gap-3">
              <GlowCard className="flex items-center gap-3 px-4 py-3">
                <Swords size={18} className="relative z-[3] text-ember-400" />
                <div className="relative z-[3]">
                  <div className="text-xs text-slate-400">Evento ativo</div>
                  <div className="text-sm font-semibold text-white">Noite das Brasas</div>
                </div>
              </GlowCard>
              <GlowCard className="flex items-center gap-3 px-4 py-3" glow="63 224 208">
                <Trophy size={18} className="relative z-[3] text-rune-400" />
                <div className="relative z-[3]">
                  <div className="text-xs text-slate-400">Temporada</div>
                  <div className="text-sm font-semibold text-white">S3 · 23 dias restantes</div>
                </div>
              </GlowCard>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1, duration: 0.8, ease: EASE }}>
            <ServerStatus />
          </motion.div>
        </div>

        <div className="mb-3 mt-8 flex items-center justify-between">
          <h2 className="label">Destaques & Patch Notes</h2>
        </div>
        <NewsCards />
      </div>
      <div className="shrink-0 px-8 pb-6">
        <ActionBar />
      </div>
    </div>
  )
}
