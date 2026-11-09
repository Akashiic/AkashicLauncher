import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Upload, RotateCcw, CloudUpload, Footprints, Pause, Info, CheckCircle2 } from 'lucide-react'
import { activeAccount, useSettings } from '@/store/settings'
import { audio } from '@/audio/AudioManager'
import { toast } from '@/store/toasts'
import { defaultSkin, readSkinFile, skinSize, type SkinInfo } from '@/lib/skin'
import { SkinViewer } from '@/components/skin/SkinViewer'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { cn, EASE } from '@/lib/cn'

/** Troca de skin: pré-visualização 3D no formato da 1.7.10, envio de .png e aplicação (simulada). */
export function SkinPage() {
  const account = useSettings((s) => activeAccount(s.settings))
  const setAccountSkin = useSettings((s) => s.setAccountSkin)
  const saved = account?.skinDataUrl ?? null
  const nickname = account?.username ?? ''
  const [pending, setPending] = useState<SkinInfo | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [walking, setWalking] = useState<'andar' | 'parado'>('andar')
  const [over, setOver] = useState(false)
  const [applying, setApplying] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const current = pending?.dataUrl ?? saved ?? defaultSkin()
  const isDefault = !pending && !saved

  useEffect(() => {
    let alive = true
    void skinSize(current).then((s) => alive && setSize(s))
    return () => {
      alive = false
    }
  }, [current])

  const pick = async (file?: File | null) => {
    if (!file) return
    try {
      const info = await readSkinFile(file)
      setPending(info)
      audio.play('toggleOn')
    } catch (e) {
      audio.play('error')
      toast({ kind: 'error', title: 'Skin inválida', body: (e as Error).message })
    }
  }

  const apply = () => {
    if (!pending || !account) return
    setApplying(true)
    // envio simulado: conta Microsoft → API da Mojang; perfil offline → servidor de skins do Forbidden
    window.setTimeout(() => {
      setAccountSkin(account.id, pending.dataUrl)
      setPending(null)
      setApplying(false)
      audio.play('success')
      toast({
        kind: 'success',
        title: 'Skin aplicada',
        body: account.type === 'microsoft' ? 'Enviada para a sua conta Microsoft (simulado).' : 'Enviada para o servidor de skins do Forbidden (simulado).',
      })
    }, 1400)
  }

  const restore = () => {
    setPending(null)
    if (account) setAccountSkin(account.id, null)
    toast({ kind: 'info', title: 'Skin padrão restaurada' })
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-7 py-6">
      <h1 className="pr-12 font-display text-[40px] text-fg">Skin</h1>
      <p className="mt-1 text-sm text-muted">Como você aparece no servidor.</p>

      <div className="mt-5 grid min-h-0 flex-1 grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-5">
        {/* pré-visualização */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-bg/70">
          <div className="relative flex-1" style={{ background: 'radial-gradient(70% 55% at 50% 60%, color-mix(in srgb, var(--brand) 55%, transparent), transparent 75%)' }}>
            <SkinViewer skin={current} walking={walking === 'andar'} className="absolute inset-0 h-full w-full" />
            <span className="pointer-events-none absolute left-3 top-3 rounded-md border border-line bg-shade/40 px-2 py-0.5 text-xs font-semibold text-fg">{nickname}</span>
            <AnimatePresence>
              {pending && (
                <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pointer-events-none absolute right-3 top-3 rounded-md border border-warning/40 bg-shade/40 px-2 py-0.5 text-xs font-semibold text-warning">
                  Prévia
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
            <span className="text-xs text-subtle">Arraste para girar</span>
            <Segmented<'andar' | 'parado'>
              size="sm"
              value={walking}
              onChange={setWalking}
              options={[
                { value: 'andar', label: 'Andar', icon: <Footprints size={12} /> },
                { value: 'parado', label: 'Parado', icon: <Pause size={12} /> },
              ]}
            />
          </div>
        </div>

        {/* ações */}
        <div className="flex min-w-0 flex-col gap-3">
          <button
            onMouseEnter={() => audio.play('hover')}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              void pick(e.dataTransfer.files?.[0])
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors',
              over ? 'border-accent-strong bg-brand/40' : 'border-line-strong bg-bg/50 hover:border-accent hover:bg-brand/20',
            )}
          >
            <Upload size={22} className="text-accent-strong" />
            <span className="text-sm font-semibold text-fg">Arraste sua skin aqui ou clique para escolher</span>
            <span className="text-xs text-muted">Arquivo .png · 64×32 ou 64×64</span>
          </button>
          <input ref={input} type="file" accept="image/png" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />

          <div className="flex items-center gap-3 rounded-2xl border border-line bg-bg/50 p-3">
            <img src={current} alt="Textura da skin" className="h-16 w-32 shrink-0 rounded border border-line bg-shade/40 object-contain" style={{ imageRendering: 'pixelated' }} />
            <div className="min-w-0 text-xs">
              <div className="truncate text-sm font-semibold text-fg">{pending ? pending.name : isDefault ? 'Skin padrão Forbidden' : 'Sua skin atual'}</div>
              <div className="mt-0.5 text-muted">{size ? `${size.width}×${size.height}` : '…'} · modelo clássico</div>
              {!pending && !isDefault && (
                <div className="mt-1 flex items-center gap-1 text-success">
                  <CheckCircle2 size={12} /> Aplicada
                </div>
              )}
            </div>
          </div>

          <AnimatePresence>
            {size?.height === 64 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
                <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <Info size={13} className="mt-px shrink-0" />
                  <span>Skin 64×64 (formato 1.8+). Na 1.7.10 a segunda camada (jaqueta, mangas, calça) não aparece, e o lado esquerdo copia o direito. A prévia já mostra como ela fica no jogo.</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-auto flex flex-wrap gap-2">
            <Button variant="primary" icon={<CloudUpload size={15} />} disabled={!pending || applying} onClick={apply} sound={null}>
              {applying ? 'Aplicando…' : 'Aplicar skin'}
            </Button>
            {pending && (
              <Button variant="ghost" onClick={() => setPending(null)}>
                Descartar
              </Button>
            )}
            {!pending && !isDefault && (
              <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={restore}>
                Restaurar padrão
              </Button>
            )}
          </div>
          <p className="text-xs text-subtle">A 1.7.10 não tem braço fino (modelo Alex): skins &quot;slim&quot; aparecem com braços normais.</p>
        </div>
      </div>
    </div>
  )
}
