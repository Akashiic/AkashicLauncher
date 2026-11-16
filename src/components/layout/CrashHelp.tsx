import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Cpu, ExternalLink, FileText, MemoryStick, PackageX, X } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { useLaunch } from '@/store/launch'
import { bridge } from '@/lib/bridge'
import { audio } from '@/audio/AudioManager'
import { toast } from '@/store/toasts'
import { Button } from '@/components/ui/Button'
import { EASE } from '@/lib/cn'

const ICONS = { gpu_driver: Cpu, gpu_unsupported: Cpu, memory: MemoryStick, duplicate_mods: PackageX, missing_mods: PackageX } as const

/** Depois de um crash reconhecido: o que houve, o passo a passo e o site do driver. */
export function CrashHelp() {
  const help = useUi((s) => s.crashHelp)
  const setHelp = useUi((s) => s.setCrashHelp)
  const close = () => {
    audio.play('close')
    setHelp(null)
  }

  useEffect(() => {
    if (!help) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  })

  const open = (url: string) => {
    audio.play('click')
    void bridge.shell.openExternal(url).catch(() => toast({ kind: 'error', title: 'Não deu para abrir o navegador', body: url }))
  }

  const Icon = help ? ICONS[help.kind] : Cpu

  return (
    <AnimatePresence>
      {help && (
        <motion.div className="fixed inset-0 z-[70] flex items-center justify-center p-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <div className="absolute inset-0 bg-bg/75 backdrop-blur-sm" onClick={close} />
          <motion.div
            role="dialog"
            aria-label={help.title}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="panel-raised relative flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-3xl"
          >
            <button aria-label="Fechar" onClick={close} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-overlay/[0.07] hover:text-fg">
              <X size={15} />
            </button>
            <div className="overflow-y-auto px-6 pb-5 pt-6">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-accent/50 bg-brand/50 text-accent-strong">
                  <Icon size={20} />
                </span>
                <div>
                  <div className="label !text-[11px]">O Minecraft fechou com erro</div>
                  <h2 className="font-display text-[30px] leading-tight text-fg">{help.title}</h2>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{help.body}</p>

              {help.gpus.length > 0 && (
                <div className="mt-3 rounded-xl border border-line bg-bg/60 px-3 py-2 text-xs">
                  <span className="text-subtle">Placa(s) de vídeo neste PC: </span>
                  <span className="text-fg">{help.gpus.join(' · ')}</span>
                </div>
              )}

              {help.kind === 'gpu_unsupported' && useSettings.getState().settings.compatGpu && (
                <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3 text-xs leading-relaxed text-muted">
                  O modo compatibilidade já estava ligado, e o launcher já usou o Java ajustado para placas Intel antigas. Se o erro continua, o driver de vídeo deste PC não oferece OpenGL para o Minecraft neste Windows: só uma placa de vídeo dedicada resolve.
                </div>
              )}
              {help.kind === 'gpu_unsupported' && !useSettings.getState().settings.compatGpu && (
                <div className="mt-4 rounded-xl border border-accent/50 bg-brand/25 px-3.5 py-3">
                  <div className="text-sm font-semibold text-fg">Quer jogar mesmo assim?</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">O modo compatibilidade desliga só o Angelica e o Distant Horizons, que exigem OpenGL 3.3. O resto do modpack fica igual (sem shaders, sem terreno distante e com menos FPS).</p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-2.5"
                    onClick={() => {
                      useSettings.getState().update({ compatGpu: true })
                      setHelp(null)
                      toast({ kind: 'success', title: 'Modo compatibilidade ligado', body: 'Abrindo o jogo sem os mods que exigem OpenGL 3.3.' }, 4000)
                      window.setTimeout(() => useLaunch.getState().play(), 400)
                    }}
                  >
                    Ativar modo compatibilidade e jogar
                  </Button>
                </div>
              )}

              <ol className="mt-4 space-y-2">
                {help.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-fg">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-accent/60 text-[11px] font-semibold text-accent-strong">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>

              {help.links.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {help.links.map((l, i) => (
                    <Button key={l.url} variant={i === 0 ? 'primary' : 'panel'} size="sm" sound={null} icon={<ExternalLink size={13} />} onClick={() => open(l.url)}>
                      {l.label}
                    </Button>
                  ))}
                </div>
              )}

              <details className="mt-5 text-xs text-subtle">
                <summary className="cursor-pointer select-none hover:text-muted">Detalhes técnicos</summary>
                <div className="mt-2 break-all rounded-lg bg-bg px-3 py-2 font-mono text-[11px] text-muted">{help.evidence}</div>
                {help.report && <div className="mt-1.5 break-all">Relatório: {help.report}</div>}
              </details>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line px-6 py-3">
              <Button
                variant="ghost"
                size="sm"
                icon={<FileText size={13} />}
                onClick={() => {
                  setHelp(null)
                  useUi.getState().setLogsOpen(true)
                }}
              >
                Ver logs
              </Button>
              <Button variant="panel" size="sm" sound={null} onClick={close}>
                Entendi
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
