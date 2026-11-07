/**
 * AudioManager — motor de áudio global do Akashic Launcher.
 *
 * Três barramentos independentes, cada um com ganho e mute próprios:
 *   - BGM  : música ambiente generativa (ou arquivo local em loop)
 *   - SFX  : sons de interface (hover, click, toggle, slider, tab...)
 *   - SBFX : ambiência (vento/atmosfera) e efeitos de impacto (whoosh + chime)
 *
 * Tudo é sintetizado com a Web Audio API, então funciona sem nenhum asset.
 * Para usar arquivos reais, coloque-os em `public/audio/` e registre:
 *
 *   audio.registerSample('click', '/audio/click.ogg')
 *   audio.setBgmTrack('/audio/theme.ogg')
 *   audio.setAmbienceTrack('/audio/wind.ogg')
 *
 * Um sample registrado substitui automaticamente o som sintetizado de mesmo nome.
 */

export type Bus = 'bgm' | 'sfx' | 'sbfx'

export type SfxName =
  | 'hover'
  | 'click'
  | 'toggleOn'
  | 'toggleOff'
  | 'tick'
  | 'tab'
  | 'open'
  | 'close'
  | 'success'
  | 'error'
  | 'whoosh'
  | 'chime'
  | 'play'

export interface ChannelSettings {
  volume: number // 0..1
  muted: boolean
}

export interface AudioSettings {
  master: ChannelSettings
  bgm: ChannelSettings
  sfx: ChannelSettings
  sbfx: ChannelSettings
}

/** Curva perceptual — volume linear de slider → ganho. */
const curve = (v: number) => Math.max(0, Math.min(1, v)) ** 2

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)

// Progressão em Lá menor eólio, voicings abertos (MIDI).
const CHORDS: number[][] = [
  [45, 52, 59, 60, 64], // Am(add9)
  [41, 48, 55, 57, 64], // Fmaj7
  [43, 50, 57, 59, 62], // G6/9
  [40, 47, 55, 59, 62], // Em7
]
const BELL_SCALE = [69, 72, 74, 76, 79, 81, 84, 86, 88] // A pentatônica menor

class AudioManagerImpl {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private buses!: Record<Bus, GainNode>
  /** Entrada "wet" (reverb + delay) por barramento — retorna no próprio barramento. */
  private wet!: Record<Bus, GainNode>
  private noiseBuffer: AudioBuffer | null = null

  private samples = new Map<string, AudioBuffer>()
  private pendingSamples = new Map<string, string>()

  private settings: AudioSettings = {
    master: { volume: 0.8, muted: false },
    bgm: { volume: 0.45, muted: false },
    sfx: { volume: 0.7, muted: false },
    sbfx: { volume: 0.5, muted: false },
  }

  // BGM
  private bgmWanted = false
  private bgmGain: GainNode | null = null
  private bgmTimer: number | null = null
  private bellTimer: number | null = null
  private chordIndex = 0
  private nextChordAt = 0
  private bgmTrackUrl: string | null = null
  private bgmTrackSource: AudioBufferSourceNode | null = null

  // Ambiência
  private ambienceWanted = false
  private ambienceGain: GainNode | null = null
  private ambienceNodes: AudioScheduledSourceNode[] = []
  private ambienceTrackUrl: string | null = null

  private lastHover = 0
  private listeners = new Set<() => void>()

  /* ------------------------------------------------------------------ */
  /* Ciclo de vida                                                       */
  /* ------------------------------------------------------------------ */

  /** Cria o contexto (lazy) e instala o desbloqueio por gesto do usuário. */
  init() {
    if (this.ctx) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx({ latencyHint: 'interactive' })
    this.ctx = ctx

    this.master = ctx.createGain()
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 3
    comp.attack.value = 0.004
    comp.release.value = 0.2
    this.master.connect(comp).connect(ctx.destination)

    this.buses = {
      bgm: ctx.createGain(),
      sfx: ctx.createGain(),
      sbfx: ctx.createGain(),
    }
    Object.values(this.buses).forEach((b) => b.connect(this.master))

    // Reverb + delay por barramento (impulse response gerada proceduralmente)
    const impulse = this.makeImpulse(3.2, 2.6)
    const makeWet = (bus: Bus, delayTime: number, feedback: number, delayMix: number) => {
      const input = ctx.createGain()
      const conv = ctx.createConvolver()
      conv.buffer = impulse
      const ret = ctx.createGain()
      ret.gain.value = 0.6
      input.connect(conv).connect(ret)
      if (delayMix > 0) {
        const d = ctx.createDelay(2)
        d.delayTime.value = delayTime
        const fb = ctx.createGain()
        fb.gain.value = feedback
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 2400
        const mix = ctx.createGain()
        mix.gain.value = delayMix
        input.connect(d)
        d.connect(lp).connect(fb).connect(d)
        lp.connect(mix).connect(ret)
      }
      ret.connect(this.buses[bus])
      return input
    }
    this.wet = {
      bgm: makeWet('bgm', 0.42, 0.38, 0.8),
      sfx: makeWet('sfx', 0, 0, 0),
      sbfx: makeWet('sbfx', 0.33, 0.3, 0.6),
    }

    this.noiseBuffer = this.makeNoise(4)
    this.applyGains(true)

    const unlock = () => {
      if (ctx.state !== 'running') ctx.resume().catch(() => {})
    }
    window.addEventListener('pointerdown', unlock, { capture: true })
    window.addEventListener('keydown', unlock, { capture: true })
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running') {
        if (this.bgmWanted && !this.bgmGain) this.startBgm()
        if (this.ambienceWanted && !this.ambienceGain) this.startAmbience()
      }
      this.emit()
    })
    ctx.resume().catch(() => {})

    // Carrega samples registrados antes da criação do contexto
    this.pendingSamples.forEach((url, name) => void this.loadSample(name, url))
    this.pendingSamples.clear()
  }

  get unlocked() {
    return this.ctx?.state === 'running'
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private emit() {
    this.listeners.forEach((l) => l())
  }

  /* ------------------------------------------------------------------ */
  /* Volumes                                                             */
  /* ------------------------------------------------------------------ */

  applySettings(s: AudioSettings) {
    this.settings = s
    this.applyGains()
  }

  private applyGains(immediate = false) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const set = (g: GainNode, ch: ChannelSettings) => {
      const v = ch.muted ? 0 : curve(ch.volume)
      g.gain.cancelScheduledValues(t)
      if (immediate) g.gain.setValueAtTime(v, t)
      else g.gain.setTargetAtTime(v, t, 0.06)
    }
    set(this.master, this.settings.master)
    set(this.buses.bgm, this.settings.bgm)
    set(this.buses.sfx, this.settings.sfx)
    set(this.buses.sbfx, this.settings.sbfx)
  }

  /* ------------------------------------------------------------------ */
  /* Samples (arquivos locais)                                           */
  /* ------------------------------------------------------------------ */

  /** Registra um arquivo que substitui o SFX sintetizado de mesmo nome. */
  registerSample(name: SfxName | string, url: string) {
    if (!this.ctx) this.pendingSamples.set(name, url)
    else void this.loadSample(name, url)
  }

  private async loadSample(name: string, url: string) {
    if (!this.ctx) return
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status}`)
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer())
      this.samples.set(name, buf)
    } catch (e) {
      console.warn(`[audio] sample "${name}" (${url}) não carregou — usando síntese.`, e)
    }
  }

  private playSample(name: string, bus: Bus, gain = 1, rate = 1) {
    const buf = this.samples.get(name)
    if (!buf || !this.ctx) return false
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = this.ctx.createGain()
    g.gain.value = gain
    src.connect(g).connect(this.buses[bus])
    src.start()
    return true
  }

  /* ------------------------------------------------------------------ */
  /* SFX de interface                                                    */
  /* ------------------------------------------------------------------ */

  play(name: SfxName, opts: { pitch?: number } = {}) {
    if (!this.ctx) this.init()
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const bus: Bus = name === 'whoosh' || name === 'chime' || name === 'play' || name === 'open' ? 'sbfx' : 'sfx'
    if (this.playSample(name, bus, 1, opts.pitch ?? 1)) return

    const t = ctx.currentTime + 0.002
    switch (name) {
      case 'hover': {
        const now = performance.now()
        if (now - this.lastHover < 45) return
        this.lastHover = now
        this.blip(t, 2600, 1900, 0.028, 0.06, 'sine')
        break
      }
      case 'click': {
        // Corpo grave + transiente de ruído = clique "tátil"
        this.blip(t, 220, 90, 0.09, 0.32, 'triangle')
        this.blip(t, 1400, 700, 0.03, 0.08, 'square', 3000)
        this.noiseHit(t, 0.025, 0.12, 4500, 'bandpass')
        break
      }
      case 'toggleOn':
        this.blip(t, 660, 660, 0.06, 0.12, 'sine')
        this.blip(t + 0.055, 990, 990, 0.09, 0.12, 'sine')
        break
      case 'toggleOff':
        this.blip(t, 880, 880, 0.06, 0.1, 'sine')
        this.blip(t + 0.055, 520, 520, 0.09, 0.1, 'sine')
        break
      case 'tick': {
        const p = opts.pitch ?? 1
        this.blip(t, 1800 * p, 1500 * p, 0.018, 0.07, 'triangle')
        break
      }
      case 'tab':
        this.noiseSweep(t, 0.16, 1200, 3800, 0.08)
        this.blip(t + 0.01, 1320, 1320, 0.07, 0.05, 'sine')
        break
      case 'open':
        this.noiseSweep(t, 0.45, 300, 2600, 0.18)
        this.bell(t + 0.12, midi(81), 0.12, 1.8)
        this.bell(t + 0.2, midi(88), 0.07, 1.6)
        break
      case 'close':
        this.noiseSweep(t, 0.3, 2400, 400, 0.12)
        break
      case 'success':
        ;[76, 81, 88].forEach((n, i) => this.bell(t + i * 0.08, midi(n), 0.12, 1.4))
        break
      case 'error':
        this.blip(t, 240, 180, 0.16, 0.18, 'sawtooth', 900)
        this.blip(t + 0.12, 200, 140, 0.2, 0.18, 'sawtooth', 900)
        break
      case 'whoosh':
        this.whoosh(t)
        break
      case 'chime':
        this.chime(t)
        break
      case 'play':
        // Impacto do botão JOGAR: whoosh grave + sub + chime brilhante
        this.whoosh(t)
        this.sub(t + 0.05)
        this.chime(t + 0.28)
        break
    }
  }

  /* ---------------------------- primitivas --------------------------- */

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  private blip(t: number, f0: number, f1: number, dur: number, peak: number, type: OscillatorType, lp?: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    const g = ctx.createGain()
    this.env(g, t, peak, 0.003, dur)
    let node: AudioNode = o
    if (lp) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = lp
      node = node.connect(f)
    }
    node.connect(g).connect(this.buses.sfx)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  private noiseHit(t: number, dur: number, peak: number, freq: number, type: BiquadFilterType, bus: Bus = 'sfx') {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = 1.2
    const g = ctx.createGain()
    this.env(g, t, peak, 0.002, dur)
    src.connect(f).connect(g).connect(this.buses[bus])
    src.start(t, Math.random() * 3)
    src.stop(t + dur + 0.05)
  }

  private noiseSweep(t: number, dur: number, f0: number, f1: number, peak: number, bus: Bus = 'sfx') {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 1.6
    f.frequency.setValueAtTime(f0, t)
    f.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.4)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.buses[bus])
    src.start(t, Math.random() * 3)
    src.stop(t + dur + 0.05)
  }

  private bell(t: number, freq: number, peak: number, decay: number, bus: Bus = 'sbfx') {
    const ctx = this.ctx!
    const out = ctx.createGain()
    out.gain.value = 1
    out.connect(this.buses[bus])
    this.connectWet(out, bus, 0.5)
    // Parciais inarmônicos típicos de sino
    ;[
      [1, 1],
      [2.76, 0.35],
      [5.4, 0.12],
    ].forEach(([ratio, amp]) => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = freq * ratio
      const g = ctx.createGain()
      this.env(g, t, peak * amp, 0.004, decay / ratio)
      o.connect(g).connect(out)
      o.start(t)
      o.stop(t + decay + 0.1)
    })
  }

  private whoosh(t: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.Q.value = 4
    f.frequency.setValueAtTime(180, t)
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.35)
    f.frequency.exponentialRampToValueAtTime(140, t + 0.9)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.3)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95)
    src.connect(f).connect(g).connect(this.buses.sbfx)
    this.connectWet(g, 'sbfx', 0.35)
    src.start(t, Math.random() * 2)
    src.stop(t + 1)
  }

  private sub(t: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(110, t)
    o.frequency.exponentialRampToValueAtTime(38, t + 0.7)
    const g = ctx.createGain()
    this.env(g, t, 0.55, 0.01, 0.8)
    o.connect(g).connect(this.buses.sbfx)
    o.start(t)
    o.stop(t + 0.9)
  }

  private chime(t: number) {
    ;[81, 88, 93, 100].forEach((n, i) => this.bell(t + i * 0.06, midi(n), 0.1 - i * 0.015, 2.4))
  }

  /** Envia um nó para o reverb/delay do barramento indicado. */
  private connectWet(node: AudioNode, bus: Bus, amount: number) {
    const send = this.ctx!.createGain()
    send.gain.value = amount
    node.connect(send).connect(this.wet[bus])
  }

  /* ------------------------------------------------------------------ */
  /* BGM                                                                 */
  /* ------------------------------------------------------------------ */

  /** Usa um arquivo local como BGM (loop) em vez da trilha generativa. */
  setBgmTrack(url: string | null) {
    this.bgmTrackUrl = url
    if (this.bgmGain) {
      this.stopBgm(0.4)
      window.setTimeout(() => this.startBgm(), 500)
    }
  }

  startBgm(fadeIn = 4) {
    this.bgmWanted = true
    if (!this.ctx) this.init()
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running' || this.bgmGain) return

    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + fadeIn)
    g.connect(this.buses.bgm)
    this.bgmGain = g

    if (this.bgmTrackUrl) {
      void this.playBgmFile(this.bgmTrackUrl, g)
      return
    }

    // Trilha generativa: pads + sinos esparsos
    this.connectWet(g, 'bgm', 0.55)

    this.nextChordAt = ctx.currentTime + 0.1
    const schedule = () => {
      if (!this.bgmGain || !this.ctx) return
      while (this.nextChordAt < this.ctx.currentTime + 1.5) {
        this.padChord(this.nextChordAt, CHORDS[this.chordIndex % CHORDS.length], 9)
        this.chordIndex++
        this.nextChordAt += 8
      }
    }
    schedule()
    this.bgmTimer = window.setInterval(schedule, 500)

    const bells = () => {
      if (!this.bgmGain || !this.ctx) return
      const n = BELL_SCALE[Math.floor(Math.random() * BELL_SCALE.length)]
      this.bgmBell(this.ctx.currentTime + 0.05, midi(n))
      this.bellTimer = window.setTimeout(bells, 1400 + Math.random() * 2600)
    }
    this.bellTimer = window.setTimeout(bells, 3000)
  }

  private async playBgmFile(url: string, out: GainNode) {
    const ctx = this.ctx!
    try {
      let buf = this.samples.get(`bgm:${url}`)
      if (!buf) {
        const res = await fetch(url)
        buf = await ctx.decodeAudioData(await res.arrayBuffer())
        this.samples.set(`bgm:${url}`, buf)
      }
      if (this.bgmGain !== out) return
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.connect(out)
      src.start()
      this.bgmTrackSource = src
    } catch (e) {
      console.warn('[audio] BGM não carregou, voltando à trilha generativa.', e)
      this.bgmTrackUrl = null
      this.bgmGain = null
      out.disconnect()
      this.startBgm(2)
    }
  }

  private padChord(t: number, notes: number[], dur: number) {
    const ctx = this.ctx!
    const out = this.bgmGain!
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 0.6
    lp.frequency.setValueAtTime(500, t)
    lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.5)
    lp.frequency.linearRampToValueAtTime(600, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.06, t + 2.8)
    g.gain.setValueAtTime(0.06, t + dur - 3)
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.5)
    lp.connect(g).connect(out)

    notes.forEach((n, i) => {
      const f = midi(n)
      ;[-7, 7].forEach((cents) => {
        const o = ctx.createOscillator()
        o.type = i === 0 ? 'triangle' : 'sawtooth'
        o.frequency.value = f
        o.detune.value = cents + (Math.random() - 0.5) * 4
        const vg = ctx.createGain()
        vg.gain.value = i === 0 ? 0.9 : 0.32
        o.connect(vg).connect(lp)
        o.start(t)
        o.stop(t + dur + 1.7)
      })
    })
  }

  private bgmBell(t: number, f: number) {
    const ctx = this.ctx!
    const out = this.bgmGain!
    ;[
      [1, 0.05],
      [2.01, 0.012],
    ].forEach(([r, a]) => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f * r
      const g = ctx.createGain()
      this.env(g, t, a, 0.01, 3.2)
      o.connect(g).connect(out)
      o.start(t)
      o.stop(t + 3.4)
    })
  }

  /** Fade-out suave da BGM (ex.: ao clicar em JOGAR). */
  stopBgm(fadeOut = 2.5) {
    this.bgmWanted = false
    const ctx = this.ctx
    const g = this.bgmGain
    if (!ctx || !g) return
    this.bgmGain = null
    if (this.bgmTimer) window.clearInterval(this.bgmTimer)
    if (this.bellTimer) window.clearTimeout(this.bellTimer)
    this.bgmTimer = this.bellTimer = null
    const t = ctx.currentTime
    g.gain.cancelScheduledValues(t)
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + fadeOut)
    const src = this.bgmTrackSource
    this.bgmTrackSource = null
    window.setTimeout(() => {
      try {
        src?.stop()
        g.disconnect()
      } catch {
        /* noop */
      }
    }, fadeOut * 1000 + 3000)
  }

  get bgmPlaying() {
    return !!this.bgmGain
  }

  /* ------------------------------------------------------------------ */
  /* Ambiência (SBFX)                                                    */
  /* ------------------------------------------------------------------ */

  setAmbienceTrack(url: string | null) {
    this.ambienceTrackUrl = url
    if (this.ambienceGain) {
      this.stopAmbience(0.3)
      window.setTimeout(() => this.startAmbience(), 400)
    }
  }

  startAmbience(fadeIn = 5) {
    this.ambienceWanted = true
    if (!this.ctx) this.init()
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running' || this.ambienceGain) return
    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, ctx.currentTime)
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + fadeIn)
    out.connect(this.buses.sbfx)
    this.ambienceGain = out

    if (this.ambienceTrackUrl) {
      const url = this.ambienceTrackUrl
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => {
          if (this.ambienceGain !== out) return
          const s = ctx.createBufferSource()
          s.buffer = buf
          s.loop = true
          s.connect(out)
          s.start()
          this.ambienceNodes.push(s)
        })
        .catch(() => console.warn('[audio] ambiência não carregou.'))
      return
    }

    // Vento: duas camadas de ruído filtrado com LFOs lentos
    const layer = (center: number, depth: number, rate: number, level: number, q: number) => {
      const src = ctx.createBufferSource()
      src.buffer = this.makeNoise(6, true)
      src.loop = true
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = center
      bp.Q.value = q
      const lfo = ctx.createOscillator()
      lfo.frequency.value = rate
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = depth
      lfo.connect(lfoGain).connect(bp.frequency)
      const amp = ctx.createGain()
      amp.gain.value = level
      const ampLfo = ctx.createOscillator()
      ampLfo.frequency.value = rate * 0.63
      const ampDepth = ctx.createGain()
      ampDepth.gain.value = level * 0.6
      ampLfo.connect(ampDepth).connect(amp.gain)
      src.connect(bp).connect(amp).connect(out)
      src.start()
      lfo.start()
      ampLfo.start()
      this.ambienceNodes.push(src, lfo, ampLfo)
    }
    layer(420, 260, 0.06, 0.22, 0.8)
    layer(1400, 600, 0.11, 0.05, 3.5) // assobio sutil
  }

  stopAmbience(fadeOut = 2) {
    this.ambienceWanted = false
    const ctx = this.ctx
    const g = this.ambienceGain
    if (!ctx || !g) return
    this.ambienceGain = null
    const t = ctx.currentTime
    g.gain.cancelScheduledValues(t)
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + fadeOut)
    const nodes = this.ambienceNodes
    this.ambienceNodes = []
    window.setTimeout(() => {
      nodes.forEach((n) => {
        try {
          n.stop()
        } catch {
          /* noop */
        }
      })
      g.disconnect()
    }, fadeOut * 1000 + 200)
  }

  /* ------------------------------------------------------------------ */
  /* Buffers procedurais                                                 */
  /* ------------------------------------------------------------------ */

  private makeNoise(seconds: number, brown = false) {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (brown) {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      } else d[i] = w
    }
    // crossfade nas bordas para loop sem clique
    const fade = Math.floor(ctx.sampleRate * 0.05)
    for (let i = 0; i < fade; i++) {
      const k = i / fade
      d[i] *= k
      d[len - 1 - i] *= k
    }
    return buf
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay
    }
    return buf
  }
}

export const audio = new AudioManagerImpl()

// Exemplo de substituição por arquivos reais (descomente e adicione os arquivos em public/audio):
// audio.registerSample('click', './audio/click.ogg')
// audio.registerSample('hover', './audio/hover.ogg')
// audio.setBgmTrack('./audio/theme.ogg')
// audio.setAmbienceTrack('./audio/wind.ogg')
