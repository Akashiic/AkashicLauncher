import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Background } from '@/components/fx/Background'
import { CommandColumn } from '@/components/command/CommandColumn'
import { ProfileServer } from '@/components/command/ProfileServer'
import { WindowControls } from '@/components/layout/WindowControls'
import { HomeHero } from '@/components/layout/HomeHero'
import { Panel } from '@/components/layout/Panel'
import { LogsModal } from '@/components/layout/LogsModal'
import { Toaster } from '@/components/layout/Toaster'
import { AudioUnlock } from '@/components/layout/AudioUnlock'
import { ModpackPage } from '@/pages/ModpackPage'
import { NewsPage } from '@/pages/NewsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { useServer } from '@/store/server'
import { audio } from '@/audio/AudioManager'
import { bridge } from '@/lib/bridge'
import { Logo } from '@/components/ui/Logo'
import { cn, EASE } from '@/lib/cn'

const PANELS = {
  news: { label: 'Notícias', Page: NewsPage },
  modpack: { label: 'Modpack', Page: ModpackPage },
  settings: { label: 'Configurações', Page: SettingsPage },
} as const

/**
 * Formato "B · Coluna de Comando" em janela fixa 1000×620.
 * No navegador, o app aparece numa moldura do mesmo tamanho, como a janela real.
 */
export default function App() {
  const route = useUi((s) => s.route)
  const hydrated = useSettings((s) => s.hydrated)
  const hydrate = useSettings((s) => s.hydrate)
  const panel = route === 'home' ? null : PANELS[route]
  const tickServer = useServer((s) => s.tick)

  // mock do status do servidor (substituir por um ping real depois)
  useEffect(() => {
    const id = window.setInterval(tickServer, 2800)
    return () => window.clearInterval(id)
  }, [tickServer])

  useEffect(() => {
    void hydrate().then(() => {
      audio.init()
      audio.startBgm(5) // fade-in ao abrir
      audio.startAmbience(6)
    })
  }, [hydrate])

  return (
    <div className={cn('flex h-full w-full items-center justify-center', !bridge.isElectron && 'bg-shade')}>
      {/* translateZ(0): elementos "fixed" (modais, toasts) ficam presos à janela */}
      <div
        className={cn(
          'relative flex overflow-hidden bg-bg [transform:translateZ(0)]',
          bridge.isElectron ? 'h-full w-full' : 'h-[620px] w-[1000px] rounded-2xl border border-line shadow-popover',
        )}
      >
        <Background />
        <AnimatePresence mode="wait">
          {!hydrated ? (
            <motion.div key="boot" exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }} transition={{ duration: 0.6, ease: EASE }} className="relative flex flex-1 items-center justify-center">
              <Logo size={72} />
            </motion.div>
          ) : (
            <motion.div key="shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="relative flex min-h-0 flex-1">
              <CommandColumn />
              <main className="relative min-w-0 flex-1">
                <AnimatePresence initial={false}>
                  {panel ? (
                    <Panel key={route} label={panel.label}>
                      <panel.Page />
                    </Panel>
                  ) : (
                    <HomeHero key="home" />
                  )}
                  {!panel && (
                    <motion.div
                      key="profile"
                      initial={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, y: -8, filter: 'blur(6px)', transition: { duration: 0.2 } }}
                      transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
                      className="no-drag absolute left-6 top-4 z-50"
                    >
                      <ProfileServer />
                    </motion.div>
                  )}
                </AnimatePresence>
              </main>
            </motion.div>
          )}
        </AnimatePresence>
        <WindowControls />
        <LogsModal />
        <Toaster />
        <AudioUnlock />
      </div>
    </div>
  )
}
