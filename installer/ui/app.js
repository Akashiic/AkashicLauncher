// Instalador do Forbidden Series: três telas (boas-vindas → instalando → pronto).
// A instalação em si roda em Rust (src-tauri/src/main.rs).
const tauri = window.__TAURI__
const invoke = tauri ? tauri.core.invoke : mockInvoke
const listen = tauri ? tauri.event.listen : mockListen

const $ = (id) => document.getElementById(id)
let installedPath = null

function show(step) {
  for (const s of document.querySelectorAll('.step')) s.classList.toggle('active', s.id === `step-${step}`)
}

function setProgress(pct, label) {
  $('bar').style.width = `${pct}%`
  $('pct').textContent = `${Math.round(pct)}%`
  if (label) $('progress-label').textContent = label
}

// modos (decididos em Rust ao abrir):
//   install   nada instalado → boas-vindas
//   reinstall Shift/--setup com algo instalado → boas-vindas com REINSTALAR
//   update    instalado e mais antigo → atualiza sozinho, abre o launcher e fecha
let mode = 'install'

async function init() {
  await listen('setup:progress', (e) => setProgress(e.payload.pct, e.payload.label))
  try {
    const info = await invoke('setup_info')
    mode = info.mode
    $('version').textContent = `Launcher v${info.version}${info.build ? ` · build ${info.build}` : ''}`
    $('where').textContent = `Pasta: ${info.installDir}`
    if (mode === 'reinstall' || mode === 'launch') {
      $('title').textContent = 'Reinstalar'
      $('install-label').textContent = 'REINSTALAR'
      if (info.installedVersion) $('version').textContent = `Instalado: v${info.installedVersion} · este: v${info.version}`
    }
    if (mode === 'update') {
      $('progress-kicker').textContent = info.installedVersion ? `v${info.installedVersion} → v${info.version}` : `v${info.version}`
      $('progress-title').textContent = 'Atualizando…'
      install()
    }
  } catch (e) {
    console.warn(e)
  }
}

async function install() {
  show('progress')
  setProgress(0, 'Preparando os arquivos')
  try {
    // na atualização automática o atalho fica como o jogador deixou
    const desktopShortcut = mode === 'update' ? null : $('desktop').checked
    installedPath = await invoke('install', { desktopShortcut })
    setProgress(100, 'Tudo pronto')
    if (mode === 'update') {
      $('progress-label').textContent = 'Abrindo o launcher…'
      setTimeout(openLauncher, 700)
      return
    }
    setTimeout(() => show('done'), 500)
  } catch (e) {
    $('error-text').textContent = String(e)
    show('error')
  }
}

async function openLauncher() {
  try {
    await invoke('launch', { path: installedPath })
  } catch (e) {
    console.warn(e)
  }
  closeWindow()
}

function closeWindow() {
  if (tauri) tauri.window.getCurrentWindow().close()
}

$('install').addEventListener('click', install)
$('retry').addEventListener('click', install)
$('open').addEventListener('click', openLauncher)
$('finish').addEventListener('click', closeWindow)
$('close').addEventListener('click', closeWindow)
$('min').addEventListener('click', () => tauri && tauri.window.getCurrentWindow().minimize())


// ---- modo navegador (só para ver o visual fora do app) ----
const mockHandlers = {}
function mockListen(event, cb) {
  mockHandlers[event] = cb
  return Promise.resolve(() => {})
}
function mockInvoke(cmd) {
  if (cmd === 'setup_info') {
    const m = new URLSearchParams(location.search).get('mode') || 'install'
    return Promise.resolve({ version: '0.2.0', mode: m, installedVersion: m === 'install' ? null : '0.1.0', installDir: 'C:\\Users\\Jogador\\AppData\\Roaming\\.forbiddenseries' })
  }
  if (cmd === 'install')
    return new Promise((resolve) => {
      let p = 0
      const id = setInterval(() => {
        p += 7
        mockHandlers['setup:progress']?.({ payload: { pct: Math.min(p, 96), label: p < 30 ? 'Preparando os arquivos' : p < 80 ? 'Instalando o launcher' : 'Criando atalhos' } })
        if (p >= 100) {
          clearInterval(id)
          resolve('C:\\Users\\Jogador\\AppData\\Roaming\\.forbiddenseries\\launcher\\Forbidden Series.exe')
        }
      }, 120)
    })
  return Promise.resolve()
}

// por último: o modo navegador acima precisa estar definido antes
init()
