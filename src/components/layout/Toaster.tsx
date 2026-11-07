import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react'
import { useToasts } from '@/store/toasts'
import { cn } from '@/lib/cn'

const ICON = {
  info: { i: Info, c: 'text-accent-strong', bar: 'bg-accent' },
  success: { i: CheckCircle2, c: 'text-success', bar: 'bg-success' },
  warning: { i: AlertTriangle, c: 'text-warning', bar: 'bg-warning' },
  error: { i: XCircle, c: 'text-danger-text', bar: 'bg-danger' },
}

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <div className="pointer-events-none fixed right-5 top-14 z-[70] flex w-80 flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const { i: Icon, c, bar } = ICON[t.kind]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95, filter: 'blur(8px)' }}
              animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 30, scale: 0.96, filter: 'blur(6px)' }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="panel-raised pointer-events-auto relative flex gap-3 overflow-hidden rounded-2xl p-3.5 pr-9 shadow-popover"
              role="status"
            >
              <span className={cn('absolute inset-y-0 left-0 w-[3px]', bar)} />
              <Icon size={18} className={cn('mt-0.5 shrink-0', c)} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-fg">{t.title}</div>
                {t.body && <div className="mt-0.5 break-words text-xs leading-relaxed text-muted">{t.body}</div>}
              </div>
              <button aria-label="Fechar" onClick={() => dismiss(t.id)} className="absolute right-2 top-2 rounded-md p-1 text-subtle hover:bg-overlay/[0.06] hover:text-fg">
                <X size={13} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
