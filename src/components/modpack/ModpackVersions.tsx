import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, ExternalLink, CheckCircle2, ArrowUpCircle, WifiOff, Loader2, ChevronDown } from 'lucide-react'
import { useModpack, useModpackState } from '@/store/modpack'
import { formatMB, RELEASES_PAGE } from '@/lib/modpack'
import { bridge } from '@/lib/bridge'
import { audio } from '@/audio/AudioManager'
import { Button } from '@/components/ui/Button'
import { cn, EASE } from '@/lib/cn'

const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const ago = (t: number) => {
  if (!t) return 'nunca'
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'agora há pouco' : m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`
}

/** Situação da versão + histórico de releases TEOF- do GitHub. */
export function ModpackVersions() {
  const { status, releases, fromCache, lastChecked, error, check } = useModpack()
  const mp = useModpackState()
  const [open, setOpen] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const list = all ? releases : releases.slice(0, 6)

  const chip =
    status === 'checking' ? { icon: <Loader2 size={13} className="animate-spin" />, text: 'Procurando atualizações…', cls: 'text-muted border-line' }
    : mp.kind === 'update' ? { icon: <ArrowUpCircle size={13} />, text: `${mp.latest.tag} disponível`, cls: 'text-accent-text border-accent/50 bg-brand/40' }
    : mp.kind === 'install' ? { icon: <ArrowUpCircle size={13} />, text: 'Ainda não instalado', cls: 'text-accent-text border-accent/50 bg-brand/40' }
    : mp.kind === 'current' ? { icon: <CheckCircle2 size={13} />, text: 'Atualizado', cls: 'text-success border-success/40 bg-success/10' }
    : { icon: <WifiOff size={13} />, text: 'Sem conexão com o GitHub', cls: 'text-warning border-warning/40 bg-warning/10' }

  return (
    <section className="rounded-2xl border border-line bg-bg/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', chip.cls)}>
            {chip.icon} {chip.text}
          </span>
          <span className="text-xs text-subtle">
            Verificado {ago(lastChecked)}
            {fromCache && ' · lista salva (offline)'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={<RefreshCw size={13} className={cn(status === 'checking' && 'animate-spin')} />} disabled={status === 'checking'} onClick={() => void check()}>
            Procurar atualizações
          </Button>
          <Button size="sm" variant="ghost" icon={<ExternalLink size={13} />} onClick={() => void bridge.shell.openExternal(RELEASES_PAGE)}>
            GitHub
          </Button>
        </div>
      </div>
      {status === 'error' && error && <p className="mt-2 text-xs text-danger-text">{error}</p>}

      <h3 className="label mb-2 mt-4">Histórico de versões</h3>
      {releases.length === 0 ? (
        <p className="py-4 text-center text-sm text-subtle">{status === 'checking' ? 'Carregando versões…' : 'Nenhuma versão TEOF- encontrada ainda.'}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((r, i) => {
            const isOpen = open === r.tag
            const installed = mp.installed === r.version
            return (
              <li key={r.tag} className={cn('overflow-hidden rounded-xl border transition-colors', installed ? 'border-accent/50 bg-brand/25' : 'border-line bg-surface/60')}>
                <button
                  onMouseEnter={() => audio.play('hover')}
                  onClick={() => {
                    audio.play(isOpen ? 'close' : 'tab')
                    setOpen(isOpen ? null : r.tag)
                  }}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                >
                  <span className="font-display text-[22px] text-fg">{r.tag}</span>
                  {i === 0 && <span className="rounded border border-accent/60 px-1.5 text-[11px] font-semibold text-accent-text">Mais recente</span>}
                  {installed && <span className="rounded border border-success/40 px-1.5 text-[11px] font-semibold text-success">Instalada</span>}
                  <span className="ml-auto text-xs text-muted">
                    {fmtDate(r.publishedAt)}
                    {r.asset ? ` · ${formatMB(r.asset.size)}` : ''}
                  </span>
                  <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE }} className="text-muted">
                    <ChevronDown size={15} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
                      <div className="border-t border-line px-3 pb-3 pt-2.5 text-sm">
                        {r.title !== r.tag && <div className="mb-1 font-semibold text-fg">{r.title}</div>}
                        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-muted">{r.notes || 'Sem notas para esta versão.'}</p>
                        {r.asset && <p className="mt-2 font-mono text-[11px] text-subtle">{r.asset.name}</p>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ul>
      )}
      {releases.length > 6 && (
        <button onClick={() => setAll((v) => !v)} className="mt-2 w-full rounded-lg py-1.5 text-xs text-muted transition-colors hover:bg-overlay/[0.05] hover:text-fg">
          {all ? 'Mostrar menos' : `Mostrar todas as ${releases.length} versões`}
        </button>
      )}
    </section>
  )
}
