import * as THREE from 'three'
import { readToken } from '@/theme'

/**
 * Visualizador de skin no formato da 1.7.10 (modelo clássico, textura 64×32).
 * Skins 64×64 usam só a metade de cima, como o jogo faz: membros esquerdos
 * espelham os direitos e a segunda camada (exceto o chapéu) é ignorada.
 */

type Rect = [number, number, number, number] // x0, y0, x1, y1 em pixels da textura

/** Retângulos das 6 faces de uma caixa no layout de skin do Minecraft. Ordem do BoxGeometry: +x, -x, +y, -y, +z, -z. */
function boxRects(u: number, v: number, w: number, h: number, d: number, mirror = false): Rect[] {
  const right: Rect = [u, v + d, u + d, v + d + h] // lado direito do jogador
  const front: Rect = [u + d, v + d, u + d + w, v + d + h]
  const left: Rect = [u + d + w, v + d, u + d + w + d, v + d + h]
  const back: Rect = [u + d + w + d, v + d, u + d + w + d + w, v + d + h]
  const top: Rect = [u + d, v, u + d + w, v + d]
  const bottom: Rect = [u + d + w, v, u + d + w + w, v + d]
  const flip = (r: Rect): Rect => [r[2], r[1], r[0], r[3]]
  // o modelo olha para +z: +x é o lado esquerdo do jogador
  if (!mirror) return [left, right, top, bottom, front, back]
  return [flip(right), flip(left), flip(top), flip(bottom), flip(front), flip(back)]
}

function texturedBox(w: number, h: number, d: number, rects: Rect[], mat: THREE.Material, inflate = 0) {
  const geo = new THREE.BoxGeometry(w + inflate, h + inflate, d + inflate)
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const TW = 64
  const TH = 32
  rects.forEach((r, face) => {
    const [x0, y0, x1, y1] = r
    const i = face * 4
    // vértices de cada face: topo-esq, topo-dir, base-esq, base-dir
    uv.setXY(i, x0 / TW, 1 - y0 / TH)
    uv.setXY(i + 1, x1 / TW, 1 - y0 / TH)
    uv.setXY(i + 2, x0 / TW, 1 - y1 / TH)
    uv.setXY(i + 3, x1 / TW, 1 - y1 / TH)
  })
  uv.needsUpdate = true
  return new THREE.Mesh(geo, mat)
}

/** Membro com pivô no topo (para balançar ao andar). */
function limb(rects: Rect[], mat: THREE.Material, x: number, y: number) {
  const pivot = new THREE.Group()
  pivot.position.set(x, y, 0)
  const mesh = texturedBox(4, 12, 4, rects, mat)
  mesh.position.y = -6
  pivot.add(mesh)
  return pivot
}

export class SkinModel {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(28, 1, 1, 200)
  private player = new THREE.Group()
  private base!: THREE.MeshStandardMaterial
  private overlay!: THREE.MeshStandardMaterial
  private texture: THREE.Texture | null = null
  private parts!: { head: THREE.Group; armR: THREE.Group; armL: THREE.Group; legR: THREE.Group; legL: THREE.Group }
  private raf = 0
  private last = 0
  private t = 0
  private yaw = -0.5
  private yawVel = 0
  private dragging = false
  private lastX = 0
  walking = true
  private disposed = false

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6))
    const key = new THREE.DirectionalLight(new THREE.Color(readToken('--scene-rim')), 1.6)
    key.position.set(-20, 30, 40)
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(new THREE.Color(readToken('--accent-strong')), 2.2)
    rim.position.set(30, 10, -30)
    this.scene.add(rim)

    this.base = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 })
    this.overlay = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })
    this.build()

    this.camera.position.set(0, 4, 92)
    this.camera.lookAt(0, 1, 0)
    canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
  }

  private build() {
    const b = this.base
    const head = new THREE.Group()
    head.position.y = 12
    const headMesh = texturedBox(8, 8, 8, boxRects(0, 0, 8, 8, 8), b)
    headMesh.position.y = 4
    const hat = texturedBox(8, 8, 8, boxRects(32, 0, 8, 8, 8), this.overlay, 1)
    hat.position.y = 4
    head.add(headMesh, hat)

    const body = texturedBox(8, 12, 4, boxRects(16, 16, 8, 12, 4), b)
    body.position.y = 6

    const armR = limb(boxRects(40, 16, 4, 12, 4), b, -6, 12)
    const armL = limb(boxRects(40, 16, 4, 12, 4, true), b, 6, 12)
    const legR = limb(boxRects(0, 16, 4, 12, 4), b, -2, 0)
    const legL = limb(boxRects(0, 16, 4, 12, 4, true), b, 2, 0)

    this.player.add(head, body, armR, armL, legR, legL)
    this.player.position.y = -4
    this.scene.add(this.player)
    this.parts = { head, armR, armL, legR, legL }
  }

  /** Troca a textura (data URL PNG 64×32 ou 64×64 — só a metade de cima é usada). */
  async setSkin(dataUrl: string) {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = dataUrl
    })
    if (this.disposed) return
    // recorta para 64×32 (comportamento da 1.7.10)
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 32
    c.getContext('2d')!.drawImage(img, 0, 0, 64, 32, 0, 0, 64, 32)
    const tex = new THREE.CanvasTexture(c)
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    tex.colorSpace = THREE.SRGBColorSpace
    this.texture?.dispose()
    this.texture = tex
    this.base.map = tex
    this.overlay.map = tex
    this.base.needsUpdate = true
    this.overlay.needsUpdate = true
  }

  resize(w: number, h: number) {
    this.camera.aspect = Math.max(1, w) / Math.max(1, h)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  private onDown = (e: PointerEvent) => {
    this.dragging = true
    this.lastX = e.clientX
    this.canvas.setPointerCapture?.(e.pointerId)
  }
  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return
    const dx = e.clientX - this.lastX
    this.lastX = e.clientX
    this.yaw += dx * 0.012
    this.yawVel = dx * 0.012
  }
  private onUp = () => {
    this.dragging = false
  }

  private frame = (now: number) => {
    if (this.disposed) return
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0)
    this.last = now
    this.t += dt
    if (!this.dragging) {
      this.yawVel *= 0.92
      this.yaw += this.yawVel + dt * 0.35 // giro automático lento
    }
    this.player.rotation.y = this.yaw
    const swing = this.walking ? Math.sin(this.t * 5) * 0.6 : Math.sin(this.t * 1.4) * 0.04
    const { armR, armL, legR, legL, head } = this.parts
    armR.rotation.x = swing
    armL.rotation.x = -swing
    legR.rotation.x = -swing
    legL.rotation.x = swing
    armR.rotation.z = -0.05
    armL.rotation.z = 0.05
    head.rotation.x = Math.sin(this.t * 0.9) * 0.06
    this.player.position.y = -4 + (this.walking ? Math.abs(Math.sin(this.t * 5)) * 0.6 : 0)
    this.renderer.render(this.scene, this.camera)
    this.raf = requestAnimationFrame(this.frame)
  }

  start() {
    cancelAnimationFrame(this.raf)
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  stop() {
    cancelAnimationFrame(this.raf)
  }

  dispose() {
    this.disposed = true
    this.stop()
    this.canvas.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    this.texture?.dispose()
    this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    this.base.dispose()
    this.overlay.dispose()
    this.renderer.dispose()
  }
}
