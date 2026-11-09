import { create } from 'zustand'
import { audio } from '@/audio/AudioManager'
import { toast } from '@/store/toasts'
import { activeAccount, useSettings } from '@/store/settings'
import { bridge } from '@/lib/bridge'
import { JAVA_RUNTIME, javaLabel } from '@/lib/java'

/**
 * Simulador do ciclo de vida do jogo. Nenhum arquivo é baixado e nenhum
 * processo Java é iniciado — apenas a experiência é reproduzida.
 */
export type LaunchPhase = 'ready' | 'verifying' | 'downloading' | 'launching' | 'running' | 'stopping'

interface LaunchStore {
  phase: LaunchPhase
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
let firstRun = true

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

  const download = (then: () => void) => {
    const files = 7 + Math.floor(Math.random() * 12)
    const totalMB = 38 + Math.random() * 120
    set({ phase: 'downloading', progress: 0, filesDone: 0, filesTotal: files, bytesDone: 0, bytesTotal: totalMB, speed: 0 })
    log(`[Launcher] ${files} arquivos desatualizados — baixando ${totalMB.toFixed(1)} MB`)
    let done = 0
    let speed = 6
    clear()
    timer = window.setInterval(() => {
      // velocidade oscilante com picos e quedas
      speed = Math.max(1.2, Math.min(42, speed + (Math.random() - 0.42) * 4 + (Math.random() < 0.03 ? -8 : 0)))
      done = Math.min(totalMB, done + speed * 0.08)
      const p = done / totalMB
      set({
        progress: p,
        speed,
        bytesDone: done,
        filesDone: Math.min(files, Math.floor(p * files)),
        currentFile: MOD_FILES[Math.floor(p * MOD_FILES.length * 0.999)],
        eta: (totalMB - done) / speed,
      })
      if (p >= 1) {
        window.clearInterval(timer)
        log('[Launcher] Download concluído.')
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
    log(`[Launcher] ${java} -Xms1G -Xmx${settings.memoryGb}G ${settings.jvmArgs.slice(0, 60)}... net.minecraft.launchwrapper.Launch`)
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
    const msg =
      behavior === 'tray'
        ? 'O launcher seria minimizado para a bandeja (simulado).'
        : behavior === 'close'
          ? 'O launcher seria fechado agora (simulado para teste).'
          : 'O launcher permanece aberto enquanto você joga.'
    toast({ kind: 'success', title: 'Minecraft 1.7.10 em execução', body: msg })
    runTimer = window.setInterval(() => log(RUNTIME_LOGS[Math.floor(Math.random() * RUNTIME_LOGS.length)]), 1600)
  }

  const backToReady = () => {
    clear()
    set({ phase: 'ready', progress: 0, speed: 0, currentFile: '' })
    audio.startBgm(3)
    audio.startAmbience(4)
  }

  return {
    phase: 'ready',
    progress: 0,
    speed: 0,
    currentFile: '',
    filesDone: 0,
    filesTotal: 0,
    bytesDone: 0,
    bytesTotal: 0,
    eta: 0,
    sessionStart: 0,
    logs: [line('[Launcher] Akashic Launcher pronto.')],
    play() {
      if (get().phase !== 'ready') return
      audio.play('play')
      audio.stopBgm(3)
      audio.stopAmbience(2.5)
      verify(() => {
        // Primeira execução sempre "encontra" atualização para demonstrar o download.
        const needsUpdate = firstRun || Math.random() < 0.5
        firstRun = false
        if (needsUpdate) download(launch)
        else {
          log('[Launcher] Todos os arquivos estão íntegros.')
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
      log('[Launcher] Operação cancelada pelo usuário.')
      audio.play('close')
      toast({ kind: 'info', title: 'Operação cancelada' })
      backToReady()
    },
    stop() {
      if (get().phase !== 'running' && get().phase !== 'launching') return
      clear()
      set({ phase: 'stopping' })
      log('[Client thread/INFO]: Stopping!')
      log('[Launcher] Processo do jogo finalizado (código 0).')
      bridge.window.show()
      window.setTimeout(backToReady, 900)
    },
  }
})
