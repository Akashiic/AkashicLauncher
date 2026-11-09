import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Plus, Shirt, Trash2, User } from 'lucide-react'
import { activeAccount, useSettings, type Account } from '@/store/settings'
import { useUi } from '@/store/ui'
import { audio } from '@/audio/AudioManager'
import { toast } from '@/store/toasts'
import { SkinHead } from '@/components/skin/SkinHead'
import { MicrosoftLogo } from './MicrosoftLogo'
import { cn, EASE } from '@/lib/cn'

export function AccountBadge({ type }: { type: Account['type'] }) {
  return type === 'microsoft' ? (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <MicrosoftLogo size={10} /> Microsoft
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <User size={10} /> Offline
    </span>
  )
}

/** Menu do jogador (abre para cima no rodapé da coluna): trocar, adicionar, skin e remover perfil. */
export function AccountMenu({ onClose }: { onClose: () => void }) {
  const settings = useSettings((s) => s.settings)
  const { setActiveAccount, removeAccount } = useSettings()
  const { navigate, setAddAccountOpen } = useUi()
  const current = activeAccount(settings)
  const others = settings.accounts.filter((a) => a.id !== current?.id)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (!confirm) return
    const t = window.setTimeout(() => setConfirm(false), 3500)
    return () => window.clearTimeout(t)
  }, [confirm])

  if (!current) return null
  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-overlay/[0.06]'

  return (
    <motion.div
      role="menu"
      initial={{ opacity: 0, y: 8, scale: 0.97, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
      transition={{ duration: 0.28, ease: EASE }}
      className="panel-raised absolute bottom-[calc(100%+10px)] left-0 right-0 z-50 origin-bottom rounded-2xl p-1.5"
    >
      <div className="flex items-center gap-3 rounded-xl bg-brand/35 px-3 py-2.5">
        <SkinHead size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-fg">{current.username}</div>
          <AccountBadge type={current.type} />
        </div>
        <Check size={15} className="text-accent-strong" />
      </div>

      {others.length > 0 && (
        <div className="mt-1 border-b border-line pb-1">
          <div className="label px-3 pb-1 pt-2 !text-[11px]">Trocar perfil</div>
          {others.map((a) => (
            <button
              key={a.id}
              role="menuitem"
              onMouseEnter={() => audio.play('hover')}
              onClick={() => {
                audio.play('toggleOn')
                setActiveAccount(a.id)
                toast({ kind: 'info', title: `Perfil: ${a.username}` }, 1800)
                onClose()
              }}
              className={item}
            >
              <SkinHead size={24} skin={a.skinDataUrl} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-fg">{a.username}</span>
                <AccountBadge type={a.type} />
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-1">
        <button
          role="menuitem"
          onMouseEnter={() => audio.play('hover')}
          onClick={() => {
            audio.play('open')
            navigate('skin')
            onClose()
          }}
          className={cn(item, 'text-fg')}
        >
          <Shirt size={15} className="text-muted" /> Trocar skin
        </button>
        <button
          role="menuitem"
          onMouseEnter={() => audio.play('hover')}
          onClick={() => {
            audio.play('open')
            setAddAccountOpen(true)
            onClose()
          }}
          className={cn(item, 'text-fg')}
        >
          <Plus size={15} className="text-muted" /> Adicionar perfil
        </button>
        <button
          role="menuitem"
          onMouseEnter={() => audio.play('hover')}
          onClick={() => {
            if (!confirm) {
              audio.play('click')
              setConfirm(true)
              return
            }
            audio.play('close')
            removeAccount(current.id)
            toast({ kind: 'info', title: `Perfil ${current.username} removido` })
            onClose()
          }}
          className={cn(item, confirm ? 'bg-danger/15 text-danger-text' : 'text-muted')}
        >
          <Trash2 size={15} /> {confirm ? 'Clique de novo para remover' : 'Remover este perfil'}
        </button>
      </div>
    </motion.div>
  )
}
