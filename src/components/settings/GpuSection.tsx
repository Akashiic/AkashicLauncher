import { useEffect, useState } from 'react'
import { AlertTriangle, BatteryCharging, Cpu, ExternalLink, Loader2, MonitorCog, RefreshCw, Sparkles, Zap } from 'lucide-react'
import { useSettings, type GpuPreference } from '@/store/settings'
import { bridge, type GpuInfo, type GpuReport } from '@/lib/bridge'
import { Segmented } from '@/components/ui/Segmented'
import { Button } from '@/components/ui/Button'
import { Section } from './SettingRow'
import { audio } from '@/audio/AudioManager'
import { toast } from '@/store/toasts'
import { cn } from '@/lib/cn'

const DRIVER_SITES = {
  nvidia: { label: 'Driver NVIDIA', url: 'https://www.nvidia.com/pt-br/drivers/' },
  amd: { label: 'Driver AMD', url: 'https://www.amd.com/pt/support/download/drivers.html' },
  intel: { label: 'Driver Intel', url: 'https://www.intel.com.br/content/www/br/pt/support/detect.html' },
} as const

const KIND = { integrated: 'Integrada', dedicated: 'Dedicada', basic: 'Sem driver', unknown: 'Placa de vídeo' } as const

/** Navegador (só para ver o visual): um notebook típico. */
const MOCK: GpuReport = {
  gpus: [
    { name: 'Intel(R) UHD Graphics 620', kind: 'integrated', vramMb: 1024, driverVersion: '31.0.101.2111', driverDate: '2023-02-10', score: 30, opengl33: true, vendor: 'intel', legacy: false, note: null },
    { name: 'NVIDIA GeForce MX150', kind: 'dedicated', vramMb: 2048, driverVersion: '27.21.14.5671', driverDate: '2020-11-12', score: 35, opengl33: true, vendor: 'nvidia', legacy: false, note: null },
  ],
  recommended: 0,
  suggestion: 'integrated',
  reason: 'NVIDIA GeForce MX150 e Intel(R) UHD Graphics 620 têm desempenho parecido no Forbidden. A integrada costuma ser mais estável com o Angelica, esquenta menos e economiza bateria; teste as duas e fique com a que der mais FPS.',
  hybrid: true,
}

/** Driver com mais de 18 meses: vale atualizar. */
function oldDriver(date: string | null) {
  if (!date) return false
  const t = Date.parse(date)
  return Number.isFinite(t) && Date.now() - t > 18 * 30 * 24 * 3600 * 1000
}

const fmtDate = (d: string) => d.split('-').reverse().join('/')

function GpuCard({ g, recommended }: { g: GpuInfo; recommended: boolean }) {
  const site = g.vendor ? DRIVER_SITES[g.vendor] : null
  const stale = !g.legacy && oldDriver(g.driverDate)
  return (
    <div className={cn('rounded-xl border px-3.5 py-3', recommended ? 'border-accent/60 bg-brand/25' : 'border-line bg-bg/50')}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border', g.kind === 'basic' ? 'border-danger/50 text-danger-text' : 'border-line-strong text-accent-strong')}>
          <Cpu size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-fg">{g.name}</span>
            <span className="rounded-md border border-line px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{KIND[g.kind]}</span>
            {recommended && <span className="rounded-md border border-accent bg-brand px-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg">Recomendada</span>}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {g.vramMb ? `${g.vramMb >= 4095 ? '4 GB ou mais' : g.vramMb >= 1024 ? `${Math.round(g.vramMb / 1024)} GB` : `${g.vramMb} MB`} de vídeo · ` : ''}
            {g.driverVersion ? `driver ${g.driverVersion}` : 'sem driver do fabricante'}
            {g.driverDate ? ` (${fmtDate(g.driverDate)})` : ''}
          </div>
          {!g.opengl33 && g.kind !== 'basic' && (
            <div className="mt-1 text-xs text-danger-text">Não tem OpenGL 3.3: o modpack (Angelica) não roda nesta placa.{g.note ? ` ${g.note}` : ''}</div>
          )}
          {stale && <div className="mt-1 flex items-center gap-1 text-xs text-warning"><AlertTriangle size={11} /> Driver antigo: atualizar pode dar mais FPS e evitar crashes.</div>}
        </div>
        {site && !g.legacy && (
          <Button size="sm" variant="ghost" sound={null} icon={<ExternalLink size={12} />} onClick={() => void bridge.shell.openExternal(site.url).catch(() => toast({ kind: 'error', title: 'Não deu para abrir o navegador' }))}>
            Driver
          </Button>
        )}
      </div>
    </div>
  )
}

/** Configurações → Desempenho: placas do PC, recomendação e qual placa o jogo usa. */
export function GpuSection() {
  const pref = useSettings((s) => s.settings.gpuPreference)
  const update = useSettings((s) => s.update)
  const [report, setReport] = useState<GpuReport | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    const p = bridge.game ? bridge.game.gpuInfo() : new Promise<GpuReport>((r) => setTimeout(() => r(MOCK), 500))
    void p
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const suggested = report?.suggestion ?? 'auto'
  const options: { value: GpuPreference; label: string; icon: React.ReactNode; hint: string }[] = [
    { value: 'auto', label: 'Automática', icon: <MonitorCog size={13} />, hint: 'O Windows escolhe' },
    { value: 'integrated', label: 'Integrada', icon: <BatteryCharging size={13} />, hint: 'Economia de energia (Intel UHD/Iris, Radeon do Ryzen)' },
    { value: 'dedicated', label: 'Dedicada', icon: <Zap size={13} />, hint: 'Alto desempenho (NVIDIA, Radeon RX)' },
  ]

  return (
    <Section title="Placa de vídeo" desc="As placas deste PC, qual rende mais no Forbidden e qual o jogo vai usar.">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Procurando as placas de vídeo…</div>
      ) : !report || report.gpus.length === 0 ? (
        <div className="text-sm text-muted">Não deu para ler as placas de vídeo deste sistema.</div>
      ) : (
        <div className="space-y-2.5">
          {report.gpus.map((g, i) => (
            <GpuCard key={g.name + i} g={g} recommended={report.recommended === i && report.gpus.length > 1} />
          ))}
          <div className="flex gap-2 rounded-xl border border-line bg-bg/40 px-3 py-2.5 text-xs leading-relaxed text-muted">
            <Sparkles size={13} className="mt-0.5 shrink-0 text-accent-strong" />
            <span>{report.reason}</span>
          </div>
        </div>
      )}

      {report?.hybrid && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg">Placa usada pelo jogo</div>
              <div className="mt-0.5 text-xs text-muted">
                Vale no próximo JOGAR (configuração de gráficos do Windows, só para o Java do jogo).
                {suggested !== 'auto' && suggested !== pref && (
                  <>
                    {' '}
                    Sugestão: <span className="text-accent-text">{suggested === 'integrated' ? 'Integrada' : 'Dedicada'}</span>.
                  </>
                )}
              </div>
            </div>
            <Segmented
              size="sm"
              value={pref}
              options={options}
              onChange={(gpuPreference) => {
                update({ gpuPreference })
                audio.play('toggleOn')
              }}
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={load} disabled={loading}>
          Procurar de novo
        </Button>
      </div>
    </Section>
  )
}
