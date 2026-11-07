import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Background } from '@/components/fx/Background'
import { TitleBar } from '@/components/layout/TitleBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { LogsModal } from '@/components/layout/LogsModal'
import { Toaster } from '@/components/layout/Toaster'
import { AudioUnlock } from '@/components/layout/AudioUnlock'
import { HomePage } from '@/pages/HomePage'
import { ModpackPage } from '@/pages/ModpackPage'
import { NewsPage } from '@/pages/NewsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { audio } from '@/audio/AudioManager'
import { Logo } from '@/components/ui/Logo'
import { EASE } from '@/lib/cn'

const PAGES = { home: HomePage, modpack: ModpackPage, news: NewsPage, settings: SettingsPage }

export default function App() {
  const route = useUi((s) => s.route)
  const hydrated = useSettings((s) => s.hydrated)
  const hydrate = useSettings((s) => s.hydrate)
  const Page = PAGES[route]

  useEffect(() => {
    void hydrate().then(() => {
      audio.init()
      audio.startBgm(5) // fade-in ao abrir
      audio.startAmbience(6)
    })
  }, [hydrate])

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <Background />
      <TitleBar />
      <AnimatePresence mode="wait">
        {!hydrated ? (
          <motion.div key="boot" exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }} transition={{ duration: 0.6, ease: EASE }} className="relative flex flex-1 items-center justify-center">
            <Logo size={72} />
          </motion.div>
        ) : (
          <motion.div key="shell" initial={{ opacity: 0, scale: 0.985, filter: 'blur(10px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ duration: 0.8, ease: EASE }} className="relative flex min-h-0 flex-1">
            <Sidebar />
            <main className="relative min-w-0 flex-1">
              <AnimatePresence mode="wait">
                <motion.div
                  key={route}
                  initial={{ opacity: 0, scale: 0.985, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 1.01, filter: 'blur(6px)' }}
                  transition={{ duration: 0.38, ease: EASE }}
                  className="absolute inset-0"
                >
                  <Page />
                </motion.div>
              </AnimatePresence>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
      <LogsModal />
      <Toaster />
      <AudioUnlock />
    </div>
  )
}
