import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { scenePalette, type ScenePalette } from './palette'
import { generateIsland, pixelTexture, portalFrame, type Block } from './voxels'
import { mulberry32 } from './noise'
import { beamShader, emberShader, fogShader, gradeShader, portalShader, skyShader } from './shaders'

interface Debris {
  base: THREE.Vector3
  phase: number
  spin: THREE.Vector3
  scale: number
}

/**
 * "O Portal Proibido" — cena 3D em tempo real do fundo do launcher.
 * Toda a geometria é procedural; todas as cores vêm do tema.
 */
export class PortalScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500)
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private grade: ShaderPass
  private pal: ScenePalette

  private timeUniforms: { value: number }[] = []
  private portalUniforms!: Record<string, THREE.IUniform>
  private portalLight!: THREE.PointLight
  private cursorLight!: THREE.PointLight
  private portalCenter = new THREE.Vector3()
  private beamUniforms!: Record<string, THREE.IUniform>
  private energy = 0
  private energyTarget = 0
  private impulse = 0
  private dive = 0
  private diveTarget = 0
  private lastFrameT = 0
  private dt = 0
  private debrisMesh!: THREE.InstancedMesh
  private debris: Debris[] = []

  private mouse = new THREE.Vector2()
  private mouseSmooth = new THREE.Vector2()
  private raycaster = new THREE.Raycaster()
  private cursorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -4)
  private tmp = new THREE.Vector3()
  private dummy = new THREE.Object3D()

  private width = 1
  private height = 1
  private time = 0
  private last = 0
  private raf = 0
  private running = false
  private disposed = false
  onFirstFrame?: () => void
  private firstFrameDone = false
  private warmed = false

  constructor(private canvas: HTMLCanvasElement) {
    this.pal = scenePalette()
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.35
    this.renderer.setClearColor(this.pal.bg)

    this.scene.fog = new THREE.FogExp2(this.pal.haze.getHex(), 0.013)

    this.buildSky()
    this.buildLights()
    this.buildIsland()
    this.buildDistantIslands()
    this.buildDebris()
    this.buildFog()
    this.buildEmbers()

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.95, 0.7, 0.8)
    this.composer.addPass(this.bloom)
    this.grade = new ShaderPass(gradeShader)
    this.composer.addPass(this.grade)
    this.composer.addPass(new OutputPass())

    canvas.addEventListener('webglcontextlost', this.onContextLost)
  }

  /* ------------------------------------------------------------------ */
  /* Construção                                                          */
  /* ------------------------------------------------------------------ */

  private time$() {
    const u = { value: 0 }
    this.timeUniforms.push(u)
    return u
  }

  private buildSky() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: skyShader.vertex,
      fragmentShader: skyShader.fragment,
      uniforms: { uTop: { value: this.pal.skyTop }, uHorizon: { value: this.pal.skyHorizon } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat)
    sky.renderOrder = -10
    this.scene.add(sky)
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(this.pal.stoneLight, this.pal.brand, 1.6))

    // luz de recorte vinda de trás, desenha o contorno dos blocos
    const rim = new THREE.DirectionalLight(this.pal.rim, 2.6)
    rim.position.set(-14, 16, -18)
    this.scene.add(rim)

    // luz fria-neutra frontal bem fraca, só para não perder volume nas sombras
    const fill = new THREE.DirectionalLight(this.pal.rim, 0.7)
    fill.position.set(10, 6, 20)
    this.scene.add(fill)

    this.portalLight = new THREE.PointLight(this.pal.accent, 220, 40, 1.6)
    this.scene.add(this.portalLight)

    this.cursorLight = new THREE.PointLight(this.pal.accentStrong, 30, 16, 2)
    this.scene.add(this.cursorLight)

    // brilho do abismo: ilumina a base da ilha por baixo
    const abyss = new THREE.PointLight(this.pal.accent, 700, 34, 1.5)
    abyss.position.set(2, -15, 6)
    this.scene.add(abyss)
  }

  private instanced(blocks: Block[], material: THREE.Material, color: (b: Block, i: number) => THREE.Color) {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mesh = new THREE.InstancedMesh(geo, material, blocks.length)
    blocks.forEach((b, i) => {
      this.dummy.position.set(b.x, b.y, b.z)
      this.dummy.rotation.set(0, 0, 0)
      this.dummy.scale.setScalar(1)
      this.dummy.updateMatrix()
      mesh.setMatrixAt(i, this.dummy.matrix)
      mesh.setColorAt(i, color(b, i))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    return mesh
  }

  private buildIsland() {
    const p = this.pal
    const rnd = mulberry32(11)
    const island = generateIsland({ radius: 7, depth: 10, seed: 7, magma: 16, flat: 4 })
    const minY = Math.min(...island.blocks.map((b) => b.y))
    const span = island.topY - minY || 1

    const stoneTex = pixelTexture(3, 0.38)
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, metalness: 0 })
    const tint = (a: THREE.Color, b: THREE.Color, k: number) => a.clone().lerp(b, Math.min(1, Math.max(0, k)))

    const ground = island.blocks.filter((b) => b.kind !== 'magma')
    const groundMesh = this.instanced(ground, stoneMat, (b) => {
      if (b.kind === 'crimson') return tint(p.crimson, p.crimsonLight, rnd())
      const h = (b.y - minY) / span // mais escuro embaixo
      return tint(p.stoneDark, p.stoneLight, 0.2 + h * 0.55 + rnd() * 0.3)
    })
    this.scene.add(groundMesh)

    const magma = island.blocks.filter((b) => b.kind === 'magma')
    const magmaTex = pixelTexture(21, 0.7)
    const magmaMat = new THREE.MeshStandardMaterial({
      map: magmaTex,
      color: p.brand,
      emissive: p.accentStrong,
      emissiveMap: magmaTex,
      emissiveIntensity: 2.4,
      roughness: 0.8,
    })
    this.scene.add(this.instanced(magma, magmaMat, () => new THREE.Color(1, 1, 1)))

    // moldura do portal (obsidiana brilhante reflete a luz do portal)
    const frame = portalFrame(island.topY + 1, 3, 5)
    const obsMat = new THREE.MeshStandardMaterial({ map: pixelTexture(5, 0.3), roughness: 0.35, metalness: 0, emissive: p.brand, emissiveIntensity: 0.55 })
    this.scene.add(this.instanced(frame.blocks, obsMat, () => tint(p.obsidian, p.stoneDark, rnd() * 0.6)))
    this.portalCenter.copy(frame.center)

    // energia do portal
    this.portalUniforms = {
      uTime: this.time$(),
      uIntensity: { value: 1 },
      uPixels: { value: new THREE.Vector2(frame.innerW * 16, frame.innerH * 16) },
      uDeep: { value: p.brand },
      uMid: { value: p.accent },
      uBright: { value: p.accentStrong },
      uHot: { value: p.portalHot },
    }
    const portalMat = new THREE.ShaderMaterial({
      vertexShader: portalShader.vertex,
      fragmentShader: portalShader.fragment,
      uniforms: this.portalUniforms,
      side: THREE.DoubleSide,
      fog: false,
    })
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(frame.innerW, frame.innerH), portalMat)
    portal.position.copy(frame.center)
    this.scene.add(portal)

    this.portalLight.position.copy(frame.center).add(new THREE.Vector3(0, 0, 1.6))
    const back = new THREE.PointLight(p.accent, 60, 18, 1.8)
    back.position.copy(frame.center).add(new THREE.Vector3(0, 0, -1.6))
    this.scene.add(back)

    // coluna de luz subindo do portal
    this.beamUniforms = { uTime: this.time$(), uIntensity: { value: 0.55 }, uColor: { value: p.accent } }
    const beamMat = new THREE.ShaderMaterial({
      vertexShader: beamShader.vertex,
      fragmentShader: beamShader.fragment,
      uniforms: this.beamUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    })
    const beamH = 70
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.7, beamH, 32, 1, true), beamMat)
    beam.position.set(frame.center.x, frame.center.y + frame.innerH / 2 + beamH / 2 - 1, 0)
    this.scene.add(beam)
  }

  private buildDistantIslands() {
    const p = this.pal
    const spots = [
      { x: -34, y: 3, z: -55, r: 4, s: 31 },
      { x: 30, y: 9, z: -70, r: 5, s: 42 },
      { x: -14, y: 12, z: -38, r: 2, s: 53 },
      { x: 18, y: -6, z: -30, r: 2, s: 64 },
      { x: -52, y: -4, z: -85, r: 6, s: 75 },
    ]
    const blocks: Block[] = []
    spots.forEach((sp) => {
      generateIsland({ radius: sp.r, depth: sp.r + 4, seed: sp.s }).blocks.forEach((b) => blocks.push({ ...b, x: b.x + sp.x, y: b.y + sp.y, z: b.z + sp.z }))
    })
    const mat = new THREE.MeshStandardMaterial({ map: pixelTexture(9, 0.3), roughness: 1 })
    this.scene.add(this.instanced(blocks, mat, (b) => (b.kind === 'crimson' ? p.crimson.clone() : p.stone.clone())))
  }

  private buildDebris() {
    const p = this.pal
    const rnd = mulberry32(99)
    const count = 46
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2
      const r = 10 + rnd() * 14
      let z = Math.sin(a) * r * 0.7 - 2
      if (z > 2 && Math.abs(Math.cos(a) * r) < 9) z = -z // não cobrir o portal
      this.debris.push({
        base: new THREE.Vector3(Math.cos(a) * r, -12 + rnd() * 22, z),
        phase: rnd() * Math.PI * 2,
        spin: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.5),
        scale: 0.3 + rnd() * rnd() * 1.1,
      })
    }
    const mat = new THREE.MeshStandardMaterial({ map: pixelTexture(17, 0.4), roughness: 0.9 })
    this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, count)
    for (let i = 0; i < count; i++) this.debrisMesh.setColorAt(i, rnd() < 0.2 ? p.crimson.clone() : p.stone.clone().lerp(p.stoneLight, rnd()))
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.scene.add(this.debrisMesh)
    this.updateDebris(0)
  }

  private buildFog() {
    const p = this.pal
    const layers = [
      { y: -7, op: 0.5, drift: [0.012, 0.006], color: p.brand },
      { y: -11, op: 0.4, drift: [-0.008, 0.01], color: p.brandHover },
      { y: -16, op: 0.35, drift: [0.006, -0.009], color: p.brand },
    ]
    layers.forEach((l) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: fogShader.vertex,
        fragmentShader: fogShader.fragment,
        uniforms: { uTime: this.time$(), uOpacity: { value: l.op }, uColor: { value: l.color }, uDrift: { value: new THREE.Vector2(l.drift[0], l.drift[1]) } },
        transparent: true,
        depthWrite: false,
        fog: false,
      })
      const m = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), mat)
      m.rotation.x = -Math.PI / 2
      m.position.y = l.y
      this.scene.add(m)
    })
  }

  private buildEmbers() {
    const p = this.pal
    const rnd = mulberry32(5)
    const n = 900
    const pos = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    const speed = new Float32Array(n)
    const size = new Float32Array(n)
    const col = new Float32Array(n * 3)
    const hot = [p.accent, p.accentStrong, p.portalHot]
    for (let i = 0; i < n; i++) {
      const nearPortal = rnd() < 0.35
      const r = nearPortal ? rnd() * 4 : rnd() * 24
      const a = rnd() * Math.PI * 2
      pos[i * 3] = Math.cos(a) * r + (nearPortal ? this.portalCenter.x : 0)
      pos[i * 3 + 1] = -14 + rnd() * 6
      pos[i * 3 + 2] = Math.sin(a) * r * 0.8
      seed[i] = rnd()
      speed[i] = 0.6 + rnd() * 1.6
      const ash = rnd() < 0.25
      size[i] = ash ? 0.6 + rnd() * 0.8 : 0.8 + rnd() * 1.8
      const c = ash ? p.ash.clone().multiplyScalar(0.3) : hot[Math.floor(rnd() * hot.length)].clone()
      col.set([c.r, c.g, c.b], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
    const mat = new THREE.ShaderMaterial({
      vertexShader: emberShader.vertex,
      fragmentShader: emberShader.fragment,
      uniforms: { uTime: this.time$(), uHeight: { value: 30 }, uPixelRatio: { value: this.renderer.getPixelRatio() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const pts = new THREE.Points(geo, mat)
    pts.frustumCulled = false
    this.scene.add(pts)
  }

  /* ------------------------------------------------------------------ */
  /* Animação                                                            */
  /* ------------------------------------------------------------------ */

  private updateDebris(t: number) {
    this.debris.forEach((d, i) => {
      this.dummy.position.set(d.base.x + Math.sin(t * 0.1 + d.phase) * 0.6, d.base.y + Math.sin(t * 0.35 + d.phase) * 0.8, d.base.z)
      this.dummy.rotation.set(d.spin.x * t + d.phase, d.spin.y * t, d.spin.z * t)
      this.dummy.scale.setScalar(d.scale)
      this.dummy.updateMatrix()
      this.debrisMesh.setMatrixAt(i, this.dummy.matrix)
    })
    this.debrisMesh.instanceMatrix.needsUpdate = true
  }

  /**
   * Enquadramento: o portal fica à direita, deixando a esquerda livre.
   * `dive` (0..1) leva a câmera para dentro do portal ao abrir o jogo.
   */
  private updateCamera(t: number) {
    const aspect = this.width / this.height
    this.dive += (this.diveTarget - this.dive) * ease(this.dt, 2.4)
    const d = this.dive * this.dive * (3 - 2 * this.dive) // suavização
    const calm = 1 - d

    const baseDist = 54
    const dist = THREE.MathUtils.lerp(baseDist, 9, d)
    const halfW = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * baseDist * aspect
    const shift = -halfW * (aspect > 1.3 ? 0.36 : 0.15)

    this.mouseSmooth.lerp(this.mouse, ease(this.dt, 2.8))
    const mx = this.mouseSmooth.x * calm
    const my = this.mouseSmooth.y * calm
    const orbit = (Math.sin(t * 0.045) * 0.12 + mx * 0.05) * calm

    const target = new THREE.Vector3(
      THREE.MathUtils.lerp(shift, this.portalCenter.x, d),
      THREE.MathUtils.lerp(this.portalCenter.y - 4.4, this.portalCenter.y, d) + my * 0.2,
      0,
    )
    this.camera.position.set(
      target.x + Math.sin(orbit) * dist + (Math.sin(t * 0.13) * 0.7 + mx * 1.4) * calm,
      THREE.MathUtils.lerp(this.portalCenter.y + 1.5, this.portalCenter.y + 0.3, d) + (Math.cos(t * 0.17) * 0.45 - my * 1.1) * calm + Math.sin(t * 9) * 0.04 * d,
      Math.cos(orbit) * dist,
    )
    this.camera.lookAt(target)
    this.bloom.strength = 0.95 + d * 0.9

    // luz que segue o cursor, projetada em um plano à frente da ilha
    this.raycaster.setFromCamera(this.mouseSmooth, this.camera)
    if (this.raycaster.ray.intersectPlane(this.cursorPlane, this.tmp)) this.cursorLight.position.copy(this.tmp)
  }

  private frame(t: number) {
    // suavizações em tempo real (independem da taxa de quadros)
    this.dt = Math.min(0.1, Math.max(0, t - this.lastFrameT))
    this.lastFrameT = t
    this.timeUniforms.forEach((u) => (u.value = t))
    const flicker = 0.85 + Math.sin(t * 2.3) * 0.08 + Math.sin(t * 7.1) * 0.04 + Math.sin(t * 13.7) * 0.03
    // energia vinda da interface (hover/progresso do JOGAR) + pulso do clique
    this.energy += (this.energyTarget - this.energy) * ease(this.dt, 3.7)
    this.impulse *= Math.exp(-4.3 * this.dt)
    const e = this.energy + this.impulse
    this.portalLight.intensity = 220 * flicker * (1 + e * 1.3)
    this.portalUniforms.uIntensity.value = (0.92 + (flicker - 0.85) * 0.8) * (1 + e * 0.55)
    this.beamUniforms.uIntensity.value = 0.55 * (1 + e * 1.6)
    this.grade.uniforms.uTime.value = t
    this.updateDebris(t)
    this.updateCamera(t)
    this.composer.render()
    if (!this.firstFrameDone) {
      this.firstFrameDone = true
      this.onFirstFrame?.()
    }
  }

  private loop = (now: number) => {
    if (!this.running || this.disposed) return
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.time += dt
    this.frame(this.time)
    this.raf = requestAnimationFrame(this.loop)
  }

  /* ------------------------------------------------------------------ */
  /* API pública                                                         */
  /* ------------------------------------------------------------------ */

  /** Nível de energia do portal (0 = repouso, ~1 = carregado, >1 = máximo). */
  setEnergy(v: number) {
    this.energyTarget = Math.max(0, v)
  }

  /** Mergulho da câmera no portal (0 = enquadramento normal, 1 = dentro do portal). */
  setDive(v: number) {
    this.diveTarget = Math.min(1, Math.max(0, v))
  }

  /** Pulso curto de energia (clique no JOGAR). */
  pulse(strength = 1.4) {
    this.impulse = Math.max(this.impulse, strength)
  }

  /** Posição do mouse normalizada (-1..1). */
  setMouse(x: number, y: number) {
    this.mouse.set(x, -y)
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w)
    this.height = Math.max(1, h)
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(this.width, this.height, false)
    this.composer.setSize(this.width, this.height)
    const pr = this.renderer.getPixelRatio()
    this.bloom.resolution.set(this.width * pr * 0.5, this.height * pr * 0.5)
    this.grade.uniforms.uResolution.value = [this.width * pr, this.height * pr]
    if (!this.running && this.warmed) this.frame(this.time)
  }

  /**
   * Compila todos os shaders antes do primeiro quadro, sem travar a interface:
   * com KHR_parallel_shader_compile (Chrome/Edge/WebView2 no Windows) a compilação
   * roda fora da thread principal. Sem ele, o driver ao menos ganha alguns quadros
   * de folga antes do primeiro uso. As chaves dos programas dependem do destino
   * (tela ou render target), então cada grupo é compilado com o destino real.
   */
  async warmup() {
    if (this.warmed || this.disposed) return
    const r = this.renderer
    const quad = new THREE.PlaneGeometry(2, 2)
    const group = (passes: object[]) => {
      const g = new THREE.Scene()
      const seen = new Set<THREE.Material>()
      const visit = (v: unknown) => {
        if (v instanceof THREE.Material) seen.add(v)
        else if (Array.isArray(v)) v.forEach(visit)
      }
      passes.forEach((pass) => Object.values(pass).forEach(visit))
      seen.forEach((m) => g.add(new THREE.Mesh(quad, m)))
      return g
    }
    const passes = this.composer.passes
    // o OutputPass só define tone mapping/espaço de cor no primeiro render: aplica antes, sem desenhar
    const last = passes[passes.length - 1] as OutputPass & { fsQuad: { render(r: THREE.WebGLRenderer): void } }
    if (last instanceof OutputPass) {
      const draw = last.fsQuad.render
      last.fsQuad.render = () => {}
      last.render(r, this.composer.renderTarget2, this.composer.renderTarget1, 0, false)
      last.fsQuad.render = draw
    }
    const offscreen = group(passes.slice(0, -1))
    const onscreen = group(passes.slice(-1))
    try {
      r.setRenderTarget(this.composer.renderTarget1) // a cena e os passes intermediários desenham em render targets
      const a = r.compileAsync(this.scene, this.camera)
      const b = r.compileAsync(offscreen, this.camera)
      r.setRenderTarget(null) // o último passe desenha na tela
      const c = r.compileAsync(onscreen, this.camera)
      await Promise.all([a, b, c])
      if (!r.extensions.has('KHR_parallel_shader_compile')) await new Promise((res) => setTimeout(res, 32))
    } catch (e) {
      console.warn('[cena] pré-compilação falhou; os shaders compilam no primeiro quadro.', e)
    } finally {
      r.setRenderTarget(null)
      quad.dispose()
    }
    this.warmed = true
  }

  start() {
    if (this.running || this.disposed) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  /** Renderiza um quadro em um tempo exato (quadro estático do Modo Economia e gravação de vídeo). */
  renderAt(t: number, settle = false) {
    this.time = t
    if (settle) this.mouseSmooth.copy(this.mouse)
    this.frame(t)
  }

  get isRunning() {
    return this.running
  }

  private onContextLost = (e: Event) => {
    e.preventDefault()
    this.stop()
  }

  dispose() {
    this.disposed = true
    this.stop()
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
      mats.forEach((mat) => {
        Object.values(mat).forEach((v) => v instanceof THREE.Texture && v.dispose())
        mat.dispose()
      })
    })
    this.composer.dispose()
    this.renderer.dispose()
  }
}

/** Fator de suavização exponencial para um passo de tempo `dt` (s) e taxa `k` (1/s). */
function ease(dt: number, k: number) {
  return 1 - Math.exp(-k * dt)
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
