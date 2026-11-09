import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { User, X, Check, Loader2, ShieldCheck, Info } from 'lucide-react'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { useFx } from '@/store/fx'
import { audio } from '@/audio/AudioManager'
import { toast } from '@/store/toasts'
import { MS_STEPS, loginMicrosoft } from '@/lib/auth'
import { NICK_RE, offlineUuid } from '@/lib/offlineUuid'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { MicrosoftLogo } from './MicrosoftLogo'
import { cn, EASE } from '@/lib/cn'

type Mode = 'microsoft' | 'offline'

function OptionCard({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onMouseEnter={() => audio.play('hover')}
      onClick={() => {
        if (!active) audio.play('tab')
        onClick()
      }}
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-4 text-left transition-all duration-300',
        active ? 'border-accent bg-brand/45 shadow-glow' : 'border-line bg-bg/60 hover:border-line-strong',
      )}
    >
      <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl border', active ? 'border-accent bg-brand' : 'border-line bg-surface-2')}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-fg">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
    </button>
  )
}

/**
 * Perfil obrigatório: sem perfil, esta tela bloqueia o launcher (sem botão de fechar).
 * Também serve para adicionar perfis extras pelo menu do jogador.
 */
export function AccountGate() {
  const accounts = useSettings((s) => s.settings.accounts)
  const hydrated = useSettings((s) => s.hydrated)
  const addAccount = useSettings((s) => s.addAccount)
  const addOpen = useUi((s) => s.addAccountOpen)
  const setAddOpen = useUi((s) => s.setAddAccountOpen)
  const introDone = useFx((s) => s.introDone)

  // espera um instante após a abertura: o clique que pula a abertura não pode "atravessar" para esta tela
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!introDone) return
    const t = window.setTimeout(() => setSettled(true), 450)
    return () => window.clearTimeout(t)
  }, [introDone])

  const mandatory = accounts.length === 0
  const open = hydrated && settled && (mandatory || addOpen)

  const [mode, setMode] = useState<Mode>('microsoft')
  const [nick, setNick] = useState('')
  const [step, setStep] = useState(-1) // -1 = parado; 0..n = etapa do login Microsoft
  const busy = step >= 0

  const nickError = useMemo(() => {
    if (!nick) return null
    if (nick.length < 3) return 'Mínimo de 3 caracteres.'
    if (nick.length > 16) return 'Máximo de 16 caracteres.'
    if (!NICK_RE.test(nick)) return 'Use só letras, números e _ (sem espaço ou acento).'
    if (accounts.some((a) => a.type === 'offline' && a.username.toLowerCase() === nick.toLowerCase())) return 'Você já tem um perfil offline com esse nick.'
    return null
  }, [nick, accounts])
  const nickOk = !!nick && !nickError

  useEffect(() => {
    if (!open) {
      setStep(-1)
      setNick('')
      setMode('microsoft')
    }
  }, [open])

  // Esc fecha só quando não é obrigatório
  useEffect(() => {
    if (!open || mandatory) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && setAddOpen(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, mandatory, busy, setAddOpen])

  const finish = (username: string, type: Mode) => {
    audio.play('success')
    toast({ kind: 'success', title: `Bem-vindo, ${username}!`, body: type === 'microsoft' ? 'Conta Microsoft conectada.' : 'Perfil offline criado.' })
    setAddOpen(false)
  }

  const createOffline = () => {
    if (!nickOk) return audio.play('error')
    addAccount({ type: 'offline', username: nick, uuid: offlineUuid(nick) })
    finish(nick, 'offline')
  }

  const signInMicrosoft = async () => {
    audio.play('open')
    setStep(0)
    try {
      const profile = await loginMicrosoft(setStep)
      if (accounts.some((a) => a.type === 'microsoft' && a.uuid === profile.uuid)) {
        toast({ kind: 'info', title: 'Essa conta já está adicionada' })
      } else {
        addAccount({ type: 'microsoft', username: profile.username, uuid: profile.uuid })
        finish(profile.username, 'microsoft')
      }
    } catch {
      audio.play('error')
      toast({ kind: 'error', title: 'Não foi possível entrar', body: 'Tente novamente em instantes.' })
    } finally {
      setStep(-1)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="gate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 z-[70] flex items-center justify-center bg-shade/60 p-6 backdrop-blur-sm"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gate-title"
            initial={{ opacity: 0, y: 18, scale: 0.97, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
            transition={{ duration: 0.5, ease: EASE }}
            className="panel-raised relative w-full max-w-[600px] rounded-3xl p-7"
          >
            {!mandatory && (
              <button
                aria-label="Fechar"
                disabled={busy}
                onMouseEnter={() => audio.play('hover')}
                onClick={() => {
                  audio.play('close')
                  setAddOpen(false)
                }}
                className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-overlay/[0.08] hover:text-fg disabled:opacity-40"
              >
                <X size={18} />
              </button>
            )}

            <div className="flex items-center gap-4">
              <Logo size={46} />
              <div>
                <h2 id="gate-title" className="font-display text-[38px] text-fg">
                  {mandatory ? 'Crie seu perfil' : 'Adicionar perfil'}
                </h2>
                <p className="text-sm text-muted">{mandatory ? 'Para entrar no Forbidden Series você precisa de um perfil de jogador.' : 'Adicione outra conta para alternar quando quiser.'}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <OptionCard active={mode === 'microsoft'} onClick={() => !busy && setMode('microsoft')} icon={<MicrosoftLogo size={20} />} title="Conta Microsoft" sub="Original · nick e skin oficiais" />
              <OptionCard active={mode === 'offline'} onClick={() => !busy && setMode('offline')} icon={<User size={20} className="text-fg" />} title="Perfil offline" sub="Só um nick · rápido" />
            </div>

            <div className="mt-5 min-h-[178px]">
              <AnimatePresence mode="wait" initial={false}>
                {mode === 'microsoft' ? (
                  <motion.div key="ms" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.25, ease: EASE }}>
                    {!busy ? (
                      <div className="flex flex-col gap-4">
                        <ul className="space-y-1.5 text-sm text-muted">
                          <li className="flex items-center gap-2">
                            <Check size={14} className="text-success" /> Usa o nick e a skin da sua conta original
                          </li>
                          <li className="flex items-center gap-2">
                            <Check size={14} className="text-success" /> Login pela página oficial da Microsoft
                          </li>
                          <li className="flex items-center gap-2">
                            <ShieldCheck size={14} className="text-success" /> O launcher nunca vê sua senha
                          </li>
                        </ul>
                        <Button variant="primary" size="lg" sound={null} onClick={signInMicrosoft} icon={<MicrosoftLogo size={16} />} className="w-full">
                          Entrar com a Microsoft
                        </Button>
                        <p className="flex items-center gap-1.5 text-xs text-subtle">
                          <Info size={12} /> Demonstração: o login é simulado e cria uma conta de exemplo.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-line bg-bg/60 p-4" aria-live="polite">
                        <div className="mb-3 text-sm font-semibold text-fg">Conectando sua conta…</div>
                        <ol className="space-y-2">
                          {MS_STEPS.map((label, i) => {
                            const done = step > i
                            const current = step === i
                            return (
                              <li key={label} className={cn('flex items-center gap-2.5 text-sm transition-colors', done ? 'text-fg' : current ? 'text-fg' : 'text-subtle')}>
                                <span className={cn('grid h-5 w-5 place-items-center rounded-full border', done ? 'border-success bg-success/15 text-success' : current ? 'border-accent text-accent-strong' : 'border-line')}>
                                  {done ? <Check size={11} strokeWidth={3} /> : current ? <Loader2 size={11} className="animate-spin" /> : null}
                                </span>
                                {label}
                              </li>
                            )
                          })}
                        </ol>
                        <div className="progress-track relative mt-4 h-1.5 overflow-hidden rounded-full">
                          <motion.span className="progress-fill absolute inset-y-0 left-0 rounded-full" animate={{ width: `${(Math.min(step, MS_STEPS.length) / MS_STEPS.length) * 100}%` }} transition={{ duration: 0.4, ease: EASE }} />
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.form
                    key="off"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className="flex flex-col gap-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      createOffline()
                    }}
                  >
                    <label className="flex flex-col gap-1.5">
                      <span className="label">Seu nick</span>
                      <input
                        autoFocus
                        value={nick}
                        maxLength={16}
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(e) => setNick(e.target.value.trim())}
                        placeholder="ex.: Akashi_Wanderer"
                        aria-invalid={!!nickError}
                        aria-describedby="nick-help"
                        className={cn(
                          'h-12 rounded-xl border bg-bg/70 px-4 text-[15px] text-fg placeholder:text-subtle focus:outline-none',
                          nickError ? 'border-danger' : nickOk ? 'border-success/60' : 'border-line focus:border-accent',
                        )}
                      />
                    </label>
                    <div id="nick-help" className="min-h-[18px] text-xs">
                      {nickError ? (
                        <span className="text-danger-text">{nickError}</span>
                      ) : nickOk ? (
                        <span className="text-muted">
                          UUID offline: <span className="font-mono text-subtle">{offlineUuid(nick)}</span>
                        </span>
                      ) : (
                        <span className="text-subtle">3 a 16 caracteres: letras, números e _.</span>
                      )}
                    </div>
                    <Button type="submit" variant="primary" size="lg" sound={null} disabled={!nickOk} className="w-full">
                      Criar perfil offline
                    </Button>
                    <p className="flex items-center gap-1.5 text-xs text-subtle">
                      <Info size={12} /> Perfis offline só entram em servidores que aceitam contas não-originais.
                    </p>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
