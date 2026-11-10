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

async function init() {
  try {
    const info = await invoke('setup_info')
    $('version').textContent = `Launcher v${info.version}`
    if (info.installed) {
      $('title').textContent = 'Atualizar o launcher'
      $('install-label').textContent = info.sameVersion ? 'REINSTALAR' : 'ATUALIZAR'
    }
    $('where').textContent = `Pasta: ${info.installDir}`
  } catch (e) {
    console.warn(e)
  }
  await listen('setup:progress', (e) => setProgress(e.payload.pct, e.payload.label))
}

async function install() {
  show('progress')
  setProgress(0, 'Preparando os arquivos')
  try {
    installedPath = await invoke('install', { desktopShortcut: $('desktop').checked })
    setProgress(100, 'Tudo pronto')
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

init()

// ---- modo navegador (só para ver o visual fora do app) ----
const mockHandlers = {}
function mockListen(event, cb) {
  mockHandlers[event] = cb
  return Promise.resolve(() => {})
}
function mockInvoke(cmd) {
  if (cmd === 'setup_info') return Promise.resolve({ version: '0.1.0', installed: false, sameVersion: false, installDir: 'C:\\Users\\Jogador\\AppData\\Local\\Forbidden Series' })
  if (cmd === 'install')
    return new Promise((resolve) => {
      let p = 0
      const id = setInterval(() => {
        p += 7
        mockHandlers['setup:progress']?.({ payload: { pct: Math.min(p, 96), label: p < 30 ? 'Preparando os arquivos' : p < 80 ? 'Instalando o launcher' : 'Criando atalhos' } })
        if (p >= 100) {
          clearInterval(id)
          resolve('C:\\Users\\Jogador\\AppData\\Local\\Forbidden Series\\forbidden-launcher.exe')
        }
      }, 120)
    })
  return Promise.resolve()
}
