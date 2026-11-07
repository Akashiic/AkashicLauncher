import { motion } from 'framer-motion'
import { ActionBar } from '@/components/home/ActionBar'
import { EASE } from '@/lib/cn'

export function HomePage() {
  return (
    <div className="flex h-full flex-col px-12 pb-8">
      <div className="flex flex-1 flex-col justify-center">
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} className="label text-accent-text">
          Forbidden Series
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 16, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.05, duration: 0.9, ease: EASE }}
          className="mt-3 font-display text-[128px] leading-[0.9] text-fg"
        >
          Entre no <span className="text-accent-strong">Proibido.</span>
        </motion.h1>
      </div>
      <ActionBar />
    </div>
  )
}
