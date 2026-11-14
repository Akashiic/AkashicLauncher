import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, Copy, ExternalLink, Info, Loader2, User, ShieldCheck, X } from 'lucide-react'
import { useSettings, type Account } from '@/store/settings'
import { useUi } from '@/store/ui'
import { audio } from '@/audio/AudioManager'
import { toast } from '@/store/toasts'
import { MS_STEPS, authErrorTitle, authMessage, cancelMicrosoft, isAuthFailure, loginMicrosoft, microsoftAvailable } from '@/lib/auth'
import { bridge } from '@/lib/bridge'
import { NICK_RE, offlineUuid } from '@/lib/offlineUuid'
import { Button } from '@/components/ui/Button'
import { SkinHead } from '@/components/skin/SkinHead'
import { MicrosoftLogo } from './MicrosoftLogo'
import { AccountBadge } from './AccountMenu'
import { cn, EASE } from '@/lib/cn'

type Mode = 'microsoft' | 'offline'

const slide = {
  initial: { opacity: 0, x: 16, filter: 'blur(6px)' },
  animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -16, filter: 'blur(6px)' },
  transition: { duration: 0.3, ease: EASE },
}

/**
 * Login/perfil como painel da coluna de comando (estilo launcher clássico):
 * Microsoft, perfis salvos e "mudar para modo offline". A cena fica livre à direita.
 * Sem perfil ele é obrigatório (sem "Voltar").
 */
export function AccountPanel({ mandatory }: { mandatory: boolean }) {
  const accounts = useSettings((s) => s.settings.accounts)
  const activeId = useSettings((s) => s.settings.activeAccountId)
  const { addAccount, setActiveAccount } = useSettings()
  // null = navegador (simulação); false = esta build não tem o ID do app da Microsoft
  const [msReady, setMsReady] = useState<boolean | null>(null)
  const [browserUrl, setBrowserUrl] = useState<string | null>(null)
  useEffect(() => {
    void microsoftAvailable().then(setMsReady)
  }, [])
  const setAddOpen = useUi((s) => s.setAddAccountOpen)

  const [mode, setMode] = useState<Mode>('microsoft')
  const [nick, setNick] = useState('')
  const [step, setStep] = useState(-1) // -1 parado; 0..n etapa do login Microsoft
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

  // Esc volta (só quando não é obrigatório)
  useEffect(() => {
    if (mandatory) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && setAddOpen(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [mandatory, busy, setAddOpen])

  const done = (username: string, type: Mode) => {
    audio.play('success')
    toast({ kind: 'success', title: `Bem-vindo, ${username}!`, body: type === 'microsoft' ? 'Conta Microsoft conectada.' : 'Perfil offline criado.' })
    setAddOpen(false)
  }

  const signInMicrosoft = async () => {
    if (msReady === false) {
      audio.play('error')
      toast({ kind: 'info', title: 'Contas Microsoft em breve', body: 'O login com Microsoft ainda não foi ativado nesta versão. Por enquanto, use o modo offline.' })
      return
    }
    audio.play('open')
    setBrowserUrl(null)
    setStep(0)
    try {
      const profile = await loginMicrosoft(setStep, setBrowserUrl)
      const known = accounts.some((a) => a.type === 'microsoft' && a.uuid === profile.uuid)
      // entrar de novo numa conta salva só renova nick, skin e sessão
      addAccount({ type: 'microsoft', username: profile.username, uuid: profile.uuid, skinDataUrl: profile.skin })
      if (known) {
        audio.play('success')
        toast({ kind: 'success', title: `Bem-vindo de volta, ${profile.username}!`, body: 'Sessão Microsoft renovada.' })
        setAddOpen(false)
      } else done(profile.username, 'microsoft')
    } catch (e) {
      if (isAuthFailure(e) && e.code === 'cancelled') toast({ kind: 'info', title: 'Login cancelado' }, 2500)
      else {
        audio.play('error')
        toast({ kind: 'error', title: authErrorTitle(e), body: authMessage(e) }, 9000)
      }
    } finally {
      setStep(-1)
      setBrowserUrl(null)
    }
  }

  const reopenBrowser = () => {
    if (!browserUrl) return
    audio.play('click')
    void bridge.shell.openExternal(browserUrl).catch(() => toast({ kind: 'error', title: 'Não deu para abrir o navegador', body: 'Use “Copiar link” e cole no navegador.' }))
  }

  const copyLink = () => {
    if (!browserUrl) return
    void navigator.clipboard
      .writeText(browserUrl)
      .then(() => toast({ kind: 'success', title: 'Link copiado', body: 'Cole no navegador para entrar.' }, 2500))
      .catch(() => toast({ kind: 'error', title: 'Não deu para copiar o link' }))
  }

  const createOffline = () => {
    if (!nickOk) return audio.play('error')
    addAccount({ type: 'offline', username: nick, uuid: offlineUuid(nick) })
    done(nick, 'offline')
  }

  const pick = (a: Account) => {
    audio.play('toggleOn')
    setActiveAccount(a.id)
    toast({ kind: 'info', title: `Perfil: ${a.username}` }, 1800)
    setAddOpen(false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!mandatory && (
        <button
          disabled={busy}
          onMouseEnter={() => audio.play('hover')}
          onClick={() => {
            audio.play('close')
            setAddOpen(false)
          }}
          className="mt-4 flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-overlay/[0.06] hover:text-fg disabled:opacity-40"
        >
          <ArrowLeft size={14} /> Voltar
        </button>
      )}

      <div className="flex flex-1 flex-col justify-center">
        <AnimatePresence mode="wait" initial={false}>
          {mode === 'microsoft' ? (
            <motion.div key="ms" {...slide} className="flex flex-col">
              <h2 className="font-display text-[40px] text-fg">{mandatory ? 'Entrar' : 'Adicionar perfil'}</h2>
              <p className="mt-1 text-sm text-muted">{mandatory ? 'Escolha como você quer jogar no Forbidden Series.' : 'Entre com outra conta ou escolha um perfil salvo.'}</p>

              {!busy ? (
                <>
                  <Button variant="primary" size="lg" sound={null} onClick={signInMicrosoft} icon={<MicrosoftLogo size={16} />} className={cn('mt-5 w-full !px-4', msReady === false && 'opacity-60')}>
                    Entrar com Microsoft
                  </Button>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
                    <ShieldCheck size={12} className="text-success" /> Login na página oficial · o launcher não vê sua senha
                  </p>
                </>
              ) : step === 0 && msReady ? (
                // esperando o jogador entrar na página da Microsoft
                <div className="mt-5 rounded-2xl border border-line bg-bg/60 p-3.5" aria-live="polite">
                  <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <Loader2 size={14} className="animate-spin text-accent-strong" /> Continue no navegador
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">Abrimos a página oficial da Microsoft. Entre com a sua conta por lá e volte para cá: o resto é automático.</p>
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <Button size="sm" variant="ghost" sound={null} icon={<ExternalLink size={12} />} onClick={reopenBrowser} disabled={!browserUrl} className="w-full">
                      Reabrir
                    </Button>
                    <Button size="sm" variant="ghost" sound={null} icon={<Copy size={12} />} onClick={copyLink} disabled={!browserUrl} className="w-full">
                      Copiar
                    </Button>
                  </div>
                  <button
                    onMouseEnter={() => audio.play('hover')}
                    onClick={() => {
                      audio.play('close')
                      void cancelMicrosoft()
                    }}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-xs text-muted transition-colors hover:bg-overlay/[0.06] hover:text-fg"
                  >
                    <X size={12} /> Cancelar login
                  </button>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-line bg-bg/60 p-3.5" aria-live="polite">
                  <div className="mb-2.5 text-sm font-semibold text-fg">Conectando sua conta…</div>
                  <ol className="space-y-1.5">
                    {MS_STEPS.map((label, i) => {
                      const ok = step > i
                      const now = step === i
                      return (
                        <li key={label} className={cn('flex items-center gap-2 text-[13px]', ok || now ? 'text-fg' : 'text-subtle')}>
                          <span className={cn('grid h-4 w-4 place-items-center rounded-full border', ok ? 'border-success bg-success/15 text-success' : now ? 'border-accent text-accent-strong' : 'border-line')}>
                            {ok ? <Check size={10} strokeWidth={3} /> : now ? <Loader2 size={10} className="animate-spin" /> : null}
                          </span>
                          {label}
                        </li>
                      )
                    })}
                  </ol>
                  <div className="progress-track relative mt-3 h-1.5 overflow-hidden rounded-full">
                    <motion.span className="progress-fill absolute inset-y-0 left-0 rounded-full" animate={{ width: `${(Math.min(step, MS_STEPS.length) / MS_STEPS.length) * 100}%` }} transition={{ duration: 0.4, ease: EASE }} />
                  </div>
                </div>
              )}

              {accounts.length > 0 && !busy && (
                <div className="mt-6">
                  <div className="label mb-2 !text-[11px]">Perfis salvos</div>
                  <ul className="max-h-[150px] space-y-1 overflow-y-auto pr-1">
                    {accounts.map((a) => (
                      <li key={a.id}>
                        <button
                          onMouseEnter={() => audio.play('hover')}
                          onClick={() => pick(a)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors',
                            a.id === activeId ? 'border-accent/60 bg-brand/35' : 'border-line bg-bg/50 hover:border-line-strong',
                          )}
                        >
                          <SkinHead size={26} skin={a.skinDataUrl} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-fg">{a.username}</span>
                            <AccountBadge type={a.type} />
                          </span>
                          {a.id === activeId && <Check size={14} className="text-accent-strong" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.form
              key="off"
              {...slide}
              className="flex flex-col"
              onSubmit={(e) => {
                e.preventDefault()
                createOffline()
              }}
            >
              <h2 className="font-display text-[40px] text-fg">Modo offline</h2>
              <p className="mt-1 text-sm text-muted">Só um nick. Entra em servidores que aceitam contas não-originais.</p>
              <label className="mt-5 flex flex-col gap-1.5">
                <span className="label !text-[11px]">Seu nick</span>
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
                    'h-11 rounded-xl border bg-bg/70 px-3.5 text-[15px] text-fg placeholder:text-subtle focus:outline-none',
                    nickError ? 'border-danger' : nickOk ? 'border-success/60' : 'border-line focus:border-accent',
                  )}
                />
              </label>
              <div id="nick-help" className="mt-1.5 min-h-[32px] text-xs">
                {nickError ? (
                  <span className="text-danger-text">{nickError}</span>
                ) : nickOk ? (
                  <span className="text-muted">
                    UUID offline:
                    <span className="block break-all font-mono text-[11px] text-subtle">{offlineUuid(nick)}</span>
                  </span>
                ) : (
                  <span className="text-subtle">3 a 16 caracteres: letras, números e _.</span>
                )}
              </div>
              <Button type="submit" variant="primary" size="lg" sound={null} disabled={!nickOk} icon={<User size={15} />} className="mt-2 w-full">
                Criar perfil offline
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col items-center gap-2 border-t border-line pt-3">
        <button
          disabled={busy}
          onMouseEnter={() => audio.play('hover')}
          onClick={() => {
            audio.play('tab')
            setMode((m) => (m === 'microsoft' ? 'offline' : 'microsoft'))
          }}
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-overlay/[0.06] hover:text-fg disabled:opacity-40"
        >
          {mode === 'microsoft' ? (
            <>
              <User size={14} /> Mudar para modo offline
            </>
          ) : (
            <>
              <MicrosoftLogo size={12} /> Voltar para conta Microsoft
            </>
          )}
        </button>
        {mode === 'microsoft' && msReady !== true && (
          <span className="flex items-center gap-1 text-[11px] text-subtle">
            <Info size={11} /> {msReady === null ? 'Demonstração: o login Microsoft é simulado.' : 'Login Microsoft em breve nesta versão.'}
          </span>
        )}
      </div>
    </div>
  )
}
