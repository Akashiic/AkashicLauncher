import { create } from 'zustand'
import { audio } from '@/audio/AudioManager'
import { toast } from '@/store/toasts'
import { activeAccount, useSettings } from '@/store/settings'
import { bridge } from '@/lib/bridge'
import { JAVA_RUNTIME, javaLabel } from '@/lib/java'
import { formatMB, parseTag, type ModpackRelease } from '@/lib/modpack'
import { normalizeFlags } from '@/lib/jvm'
import { modpackState, useModpack } from '@/store/modpack'

/**
 * Ciclo de vida do jogo.
 * - No app desktop: tudo é real e roda em Rust (src-tauri/src/game): Java, Minecraft
 *   1.7.10, modpack TEOF- do GitHub, Forge e o processo do jogo. Aqui só ligamos os
 *   eventos à interface.
 * - No navegador: o mesmo fluxo é simulado, para testar a interface.
 */
export type LaunchPhase = 'ready' | 'verifying' | 'downloading' | 'launching' | 'running' | 'stopping'

interface LaunchStore {
  phase: LaunchPhase
  /** Etapa atual em texto ("Minecraft 1.7.10", "Modpack TEOF-5.3"...). */
  stage: string
  progress: number
  speed: number // MB/s
  currentFile: string
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
  eta: number
  sessionStart: number
  logs: string[]
  play(): void
  verifyOnly(): void
  cancel(): void
  stop(): void
}

const MOD_FILES = [
  'mods/ae2-rv3-beta-6.jar', 'mods/Thaumcraft-1.7.10-4.2.3.5.jar', 'mods/IC2-industrialcraft-2.2.827.jar',
  'mods/BuildCraft-7.1.23.jar', 'mods/Botania-r1.8-249.jar', 'mods/TConstruct-1.7.10-1.8.8.jar',
  'mods/Mekanism-1.7.10-9.1.1.jar', 'mods/journeymap-1.7.10-5.1.4p2.jar', 'mods/NotEnoughItems-1.0.5.120.jar',
  'mods/EnderIO-1.7.10-2.3.0.429.jar', 'mods/Railcraft_1.7.10-9.12.2.0.jar', 'mods/Witchery-0.24.1.jar',
  'mods/BiomesOPlenty-1.7.10-2.1.0.jar', 'mods/ExtraUtilities-1.2.12.jar', 'mods/ThermalExpansion-4.1.5.jar',
  'config/forge.cfg', 'config/thaumcraft.cfg', 'assets/indexes/1.7.10.json', 'libraries/net/minecraftforge/forge-10.13.4.1614.jar',
  'libraries/org/lwjgl/lwjgl/2.9.1/lwjgl-2.9.1.jar', 'versions/1.7.10/1.7.10.jar', 'resourcepacks/Akashic-UI.zip',
]

const BOOT_LOGS = [
  '[Client thread/INFO] [FML]: Forge Mod Loader version 7.99.40.1614 for Minecraft 1.7.10 loading',
  `[Client thread/INFO] [FML]: Java is ${JAVA_RUNTIME.vmBanner}`,
  '[Client thread/INFO] [LaunchWrapper]: Loading tweak class name cpw.mods.fml.common.launcher.FMLTweaker',
  '[Client thread/INFO] [FML]: Searching ./mods for mods',
  '[Client thread/INFO] [FML]: Forge Mod Loader has identified 186 mods to load',
  '[Client thread/INFO] [FastCraft]: FastCraft 1.25 loaded.',
  '[Client thread/INFO] [FML]: Attempting connection with missing mods [] at CLIENT',
  '[Client thread/INFO] [FML]: Processing ObjectHolder annotations',
  '[Client thread/INFO] [Thaumcraft]: Registering research...',
  '[Client thread/INFO] [AE2:L]: Pre Initialization ( started )',
  '[Client thread/INFO] [IC2]: IC2 Experimental 2.2.827 loaded',
  '[Client thread/WARN] [FML]: Potentially Dangerous alternative prefix `minecraft` for name `pumpkin`, expected `TConstruct`.',
  '[Client thread/INFO] [Botania]: Botania r1.8-249 initialized',
  '[Client thread/INFO] [JourneyMap]: JourneyMap v5.1.4p2 starting...',
  '[Client thread/INFO] [FML]: Injecting itemstacks',
  '[Client thread/INFO] [FML]: Itemstack injection complete',
  '[Sound Library Loader/INFO]: Sound engine started',
  '[Client thread/INFO] [FML]: Forge Mod Loader has successfully loaded 186 mods',
  '[Client thread/INFO]: Connecting to play.akashic.gg, 25565',
]

const RUNTIME_LOGS = [
  '[Client thread/INFO]: [CHAT] Bem-vindo ao Akashic! Use /spawn para voltar ao spawn.',
  '[Server thread/INFO] [JourneyMap]: Mapping chunk region r.2.-1',
  '[Client thread/INFO] [AE2:C]: ME Network booted (24 channels)',
  '[Client thread/WARN]: Skipping bad option: lastServer:',
  '[Client thread/INFO]: [CHAT] <Lyra_Noct> alguém vende ferro?',
  '[Client thread/INFO] [Thaumcraft]: Aura node discovered near player',
  '[Client thread/INFO]: [CHAT] [Evento] Boss de Witchery em 15 minutos no /warp arena',
  '[Client thread/INFO] [FML]: GC: G1 Young Generation took 14ms',
  '[Client thread/INFO]: Reloading ResourceManager: Default, FMLFileResourcePack:Forge Mod Loader',
]

const ts = () => new Date().toTimeString().slice(0, 8)
const line = (s: string) => `[${ts()}] ${s}`

let timer: number | undefined
let runTimer: number | undefined
let hideTimer: number | undefined

let unlisten: (() => void)[] = []

const MB = 1024 * 1024

const clear = () => {
  window.clearInterval(timer)
  window.clearTimeout(timer)
  window.clearInterval(runTimer)
}

export const useLaunch = create<LaunchStore>((set, get) => {
  const log = (s: string) => set({ logs: [...get().logs.slice(-400), line(s)] })

  const verify = (then: () => void) => {
    const total = 1284
    set({ phase: 'verifying', progress: 0, filesDone: 0, filesTotal: total, speed: 0, currentFile: '', eta: 0 })
    log('[Launcher] Verificando integridade de 1284 arquivos (SHA-1)...')
    log(`[Launcher] Runtime Java: ${javaLabel} (incluso no launcher)`)
    const start = performance.now()
    const dur = 2600 + Math.random() * 900
    clear()
    timer = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / dur)
      const eased = 1 - (1 - k) ** 2.2
      set({
        progress: eased,
        filesDone: Math.round(eased * total),
        currentFile: MOD_FILES[Math.floor(Math.random() * MOD_FILES.length)],
        speed: 180 + Math.random() * 60, // velocidade de leitura de disco
        eta: Math.max(0, (dur - (performance.now() - start)) / 1000),
      })
      if (k >= 1) {
        window.clearInterval(timer)
        then()
      }
    }, 50)
  }

  /** Baixa (simulado) o .zip do release do modpack e marca a versão como instalada. */
  const download = (release: ModpackRelease, then: () => void) => {
    const installed = useSettings.getState().settings.modpackVersion
    const asset = release.asset
    const totalMB = asset ? asset.size / 1024 / 1024 : 150
    set({ phase: 'downloading', progress: 0, filesDone: 0, filesTotal: 1, bytesDone: 0, bytesTotal: totalMB, speed: 0, currentFile: asset?.name ?? release.tag })
    log(installed ? `[Launcher] Atualizando o modpack: TEOF-${installed} → ${release.tag}` : `[Launcher] Instalando o modpack ${release.tag}`)
    log(asset ? `[Launcher] ${asset.name} (${formatMB(asset.size)}) · ${asset.url}` : `[Launcher] ${release.tag} não tem .zip anexado (tamanho estimado)`)
    let done = 0
    let speed = 18
    clear()
    timer = window.setInterval(() => {
      // velocidade oscilante com picos e quedas (transferência simulada)
      speed = Math.max(4, Math.min(64, speed + (Math.random() - 0.4) * 6 + (Math.random() < 0.03 ? -12 : 0)))
      done = Math.min(totalMB, done + speed * 0.08)
      const p = done / totalMB
      set({ progress: p, speed, bytesDone: done, filesDone: p >= 1 ? 1 : 0, eta: (totalMB - done) / speed })
      if (p >= 1) {
        window.clearInterval(timer)
        useSettings.getState().update({ modpackVersion: release.version })
        log(`[Launcher] Modpack ${release.tag} instalado.`)
        then()
      }
    }, 80)
  }

  const launch = () => {
    const { settings } = useSettings.getState()
    set({ phase: 'launching', progress: 0, currentFile: '' })
    const account = activeAccount(settings)
    log(account ? `[Launcher] Perfil: ${account.username} (${account.type === 'microsoft' ? 'Microsoft' : 'offline'}) · UUID ${account.uuid}` : '[Launcher] Nenhum perfil selecionado')
    const java = settings.javaMode === 'custom' && settings.javaPath.trim() ? settings.javaPath.trim() : JAVA_RUNTIME.executable
    log(`[Launcher] Java: ${settings.javaMode === 'custom' ? 'personalizado' : javaLabel}`)
    log(`[Launcher] ${java} -Xms1G -Xmx${settings.memoryGb}G ${normalizeFlags(settings.jvmArgs)} net.minecraft.launchwrapper.Launch`)
    let i = 0
    clear()
    timer = window.setInterval(() => {
      log(BOOT_LOGS[i])
      i++
      set({ progress: i / BOOT_LOGS.length, currentFile: BOOT_LOGS[Math.min(i, BOOT_LOGS.length - 1)].replace(/^(\[[^\]]+\]\s*)+:?\s*/, '') })
      if (i >= BOOT_LOGS.length) {
        window.clearInterval(timer)
        running()
      }
    }, 230)
  }

  const running = () => {
    set({ phase: 'running', progress: 1, sessionStart: Date.now() })
    audio.play('success')
    const behavior = useSettings.getState().settings.launchBehavior
    bridge.window.setGameRunning(true)
    const msg =
      behavior === 'tray'
        ? bridge.isDesktop
          ? 'O launcher foi para a bandeja do sistema. Ele volta quando o jogo fechar.'
          : 'No app, o launcher iria para a bandeja do sistema agora (no navegador isso não existe).'
        : behavior === 'close'
          ? bridge.isDesktop
            ? 'O launcher vai fechar; o jogo continua aberto.'
            : 'O launcher seria fechado agora (simulado para teste).'
          : 'O launcher permanece aberto enquanto você joga.'
    toast({ kind: 'success', title: 'Minecraft 1.7.10 em execução', body: msg })
    if (behavior === 'tray') {
      // espera o clarão do portal antes de esconder a janela
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => {
        if (get().phase === 'running') {
          log('[Launcher] Minimizado para a bandeja do sistema.')
          bridge.window.hide()
        }
      }, 1600)
    }
    if (behavior === 'close' && bridge.isDesktop) {
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => bridge.window.close(), 1600)
    }
    if (!bridge.game) runTimer = window.setInterval(() => log(RUNTIME_LOGS[Math.floor(Math.random() * RUNTIME_LOGS.length)]), 1600)
  }

  // ---------------------------------------------------------------------------
  // App desktop: núcleo real em Rust
  // ---------------------------------------------------------------------------

  const appendLogs = (lines: string[]) => {
    const t = ts()
    set({ logs: [...get().logs, ...lines.map((l) => (l.startsWith('[') && /^\[\d\d:\d\d:\d\d\]/.test(l) ? l : `[${t}] ${l}`))].slice(-600) })
  }

  /** Liga os eventos do Rust ao estado (uma vez). */
  const listenNative = () => {
    const game = bridge.game
    if (!game || unlisten.length) return
    unlisten = [
      game.on('launch:progress', (p) => {
        const phase = get().phase
        if (phase !== 'verifying' && phase !== 'downloading' && phase !== 'launching') return
        const speed = p.speed / MB
        const left = (p.bytesTotal - p.bytesDone) / MB
        set({
          phase: p.phase,
          stage: p.stage,
          progress: p.progress,
          filesDone: p.filesDone,
          filesTotal: p.filesTotal,
          bytesDone: p.bytesDone / MB,
          bytesTotal: p.bytesTotal / MB,
          speed,
          eta: speed > 0.05 ? left / speed : 0,
          currentFile: p.current,
        })
      }),
      game.on('launch:logs', appendLogs),
      game.on('launch:pack-installed', (tag) => {
        const v = parseTag(tag)?.version
        if (v && useSettings.getState().settings.modpackVersion !== v) useSettings.getState().update({ modpackVersion: v })
      }),
      game.on('game:window', () => {
        if (get().phase === 'launching') running()
      }),
      game.on('game:exit', ({ code, crashReport }) => {
        const p = get().phase
        if (p !== 'running' && p !== 'launching' && p !== 'stopping') return
        window.clearTimeout(hideTimer)
        set({ phase: 'stopping' })
        log(`[Launcher] O jogo fechou (código ${code ?? '—'}).`)
        bridge.window.setGameRunning(false)
        bridge.window.show() // volta da bandeja
        if (code !== null && code !== 0 && p !== 'stopping') {
          audio.play('error')
          toast({
            kind: 'error',
            title: 'O Minecraft fechou com erro',
            body: crashReport ? `Relatório de erro salvo em ${crashReport}` : `Código de saída ${code}. Veja os logs para detalhes.`,
          }, 9000)
        }
        window.setTimeout(backToReady, 700)
      }),
    ]
  }

  const accountForLaunch = () => {
    const acc = activeAccount(useSettings.getState().settings)
    return acc ? { username: acc.username, uuid: acc.uuid, type: acc.type } : null
  }

  const playNative = async () => {
    const game = bridge.game!
    listenNative()
    const account = accountForLaunch()
    if (!account) {
      toast({ kind: 'warning', title: 'Crie um perfil antes de jogar' })
      return
    }
    audio.play('play')
    audio.stopBgm(3)
    audio.stopAmbience(2.5)
    set({ phase: 'verifying', stage: 'Preparando', progress: 0, filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0, speed: 0, eta: 0, currentFile: '' })
    // versão mais nova do modpack: releases TEOF- do GitHub
    const mp = useModpack.getState()
    if (mp.status !== 'ready') await mp.check()
    const { latest, fromCache } = useModpack.getState()
    if (fromCache) log('[Launcher] Sem conexão com o GitHub — usando a última lista de versões salva.')
    const pack = latest?.asset ? { tag: latest.tag, url: latest.asset.url, size: latest.asset.size, ...(latest.asset.sha256 ? { sha256: latest.asset.sha256 } : {}) } : null
    if (latest && !latest.asset) log(`[Launcher] O release ${latest.tag} não tem .zip anexado.`)
    const { settings } = useSettings.getState()
    const custom = settings.javaMode === 'custom' && settings.javaPath.trim() ? settings.javaPath.trim() : null
    try {
      await game.play({
        account,
        memoryGb: settings.memoryGb,
        jvmArgs: normalizeFlags(settings.jvmArgs).split(/\s+/).filter(Boolean),
        javaPath: custom,
        pack,
      })
      const now = get().phase
      if (now === 'verifying' || now === 'downloading') set({ phase: 'launching' })
    } catch (e) {
      const msg = String(e)
      if (msg === 'cancelado') {
        log('[Launcher] Operação cancelada pelo usuário.')
        toast({ kind: 'info', title: 'Operação cancelada' })
      } else {
        audio.play('error')
        toast({ kind: 'error', title: 'Não foi possível abrir o jogo', body: msg }, 10000)
      }
      backToReady()
    }
  }

  const backToReady = () => {
    clear()
    set({ phase: 'ready', progress: 0, speed: 0, currentFile: '', stage: '' })
    audio.startBgm(3)
    audio.startAmbience(4)
  }

  return {
    phase: 'ready',
    stage: '',
    progress: 0,
    speed: 0,
    currentFile: '',
    filesDone: 0,
    filesTotal: 0,
    bytesDone: 0,
    bytesTotal: 0,
    eta: 0,
    sessionStart: 0,
    logs: [line('[Launcher] Forbidden Series Launcher pronto.')],
    play() {
      if (get().phase !== 'ready') return
      if (bridge.game) return void playNative()
      audio.play('play')
      audio.stopBgm(3)
      audio.stopAmbience(2.5)
      verify(async () => {
        // versão mais nova do modpack: releases TEOF- do GitHub
        const mp = useModpack.getState()
        if (mp.status !== 'ready') await mp.check()
        const { latest, fromCache, error } = useModpack.getState()
        const st = modpackState(useSettings.getState().settings.modpackVersion, latest)
        if (fromCache) log('[Launcher] Sem conexão com o GitHub — usando a última lista de versões salva.')
        if (st.kind === 'install' || st.kind === 'update') download(st.latest, launch)
        else if (st.kind === 'unavailable') {
          log(`[Launcher] Não foi possível obter o modpack: ${error ?? 'nenhuma versão TEOF- encontrada'}`)
          audio.play('error')
          toast({ kind: 'error', title: 'Modpack indisponível', body: 'Não consegui consultar as versões no GitHub. Verifique sua conexão e tente de novo.' })
          backToReady()
        } else {
          log(st.kind === 'current' ? `[Launcher] Modpack TEOF-${st.installed} atualizado.` : `[Launcher] Não foi possível verificar atualizações; usando TEOF-${st.installed}.`)
          launch()
        }
      })
    },
    verifyOnly() {
      if (get().phase !== 'ready') {
        toast({ kind: 'warning', title: 'Aguarde', body: 'Já existe uma operação em andamento.' })
        return
      }
      audio.play('click')
      if (bridge.game) {
        listenNative()
        set({ phase: 'verifying', stage: 'Conferindo arquivos', progress: 0, filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0 })
        bridge.game
          .verify()
          .then(({ checked, repaired }) => {
            audio.play('success')
            toast({ kind: 'success', title: 'Arquivos conferidos', body: repaired ? `${checked} arquivos conferidos; ${repaired === 1 ? '1 foi baixado' : `${repaired} foram baixados`} de novo.` : `${checked} arquivos conferidos, nenhum corrompido.` })
          })
          .catch((e) => {
            if (String(e) !== 'cancelado') toast({ kind: 'error', title: 'Falha na verificação', body: String(e) })
          })
          .finally(() => backToReady())
        return
      }
      verify(() => {
        log('[Launcher] Integridade verificada: 1284/1284 OK.')
        audio.play('success')
        toast({ kind: 'success', title: 'Arquivos íntegros', body: '1284 arquivos verificados, nenhum corrompido.' })
        clear()
        set({ phase: 'ready', progress: 0 })
      })
    },
    cancel() {
      const p = get().phase
      if (p !== 'verifying' && p !== 'downloading') return
      audio.play('close')
      if (bridge.game) {
        void bridge.game.cancel() // o Rust interrompe e a chamada termina com "cancelado"
        return
      }
      log('[Launcher] Operação cancelada pelo usuário.')
      toast({ kind: 'info', title: 'Operação cancelada' })
      backToReady()
    },
    stop() {
      if (get().phase !== 'running' && get().phase !== 'launching') return
      if (bridge.game) {
        set({ phase: 'stopping' })
        log('[Launcher] Fechando o jogo...')
        void bridge.game.stop().then((ok) => {
          if (!ok) window.setTimeout(backToReady, 300) // processo já tinha terminado
        })
        return
      }
      clear()
      window.clearTimeout(hideTimer)
      set({ phase: 'stopping' })
      log('[Client thread/INFO]: Stopping!')
      log('[Launcher] Processo do jogo finalizado (código 0).')
      bridge.window.setGameRunning(false)
      bridge.window.show() // volta da bandeja
      window.setTimeout(backToReady, 900)
    },
  }
})
