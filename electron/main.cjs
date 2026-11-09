// Akashic Launcher — processo principal do Electron.
// Janela frameless, controles de janela via IPC e persistência das configurações em JSON local.
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json')

/** @type {BrowserWindow | null} */
let win = null
/** @type {Tray | null} */
let tray = null
let gameRunning = false

// ---- Bandeja do sistema ----
// Ao iniciar o jogo o launcher se esconde aqui; ao fechar o jogo ele reaparece.
function showLauncher() {
  if (!win) return
  win.show()
  if (win.isMinimized()) win.restore()
  win.focus()
}

function refreshTrayMenu() {
  if (!tray) return
  tray.setToolTip(gameRunning ? 'Forbidden Series · jogo em execução' : 'Forbidden Series')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir launcher', click: showLauncher },
      { label: 'Fechar o jogo', enabled: gameRunning, click: () => win && win.webContents.send('tray:stop-game') },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() },
    ]),
  )
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'))
  tray = new Tray(process.platform === 'darwin' ? icon.resize({ width: 16, height: 16 }) : icon)
  tray.on('click', showLauncher)
  tray.on('double-click', showLauncher)
  refreshTrayMenu()
}

function createWindow() {
  win = new BrowserWindow({
    // Formato "B · Coluna de Comando": janela fixa 1000×620
    width: 1000,
    height: 620,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    roundedCorners: true,
    frame: false,
    transparent: false,
    backgroundColor: '#0D0D0D', // pré-pintura da janela: espelha --bg-base de src/theme/tokens.css
    show: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Permite que o AudioContext toque BGM sem gesto prévio do usuário.
      autoplayPolicy: 'no-user-gesture-required',
    },
  })

  win.once('ready-to-show', () => win && win.show())
  win.on('maximize', () => win && win.webContents.send('window:maximized', true))
  win.on('unmaximize', () => win && win.webContents.send('window:maximized', false))

  if (DEV_URL) win.loadURL(DEV_URL)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

// ---- Controles de janela ----
ipcMain.on('window:minimize', () => win && win.minimize())
ipcMain.on('window:toggle-maximize', () => {
  if (!win) return
  win.isMaximized() ? win.unmaximize() : win.maximize()
})
ipcMain.on('window:close', () => win && win.close())
ipcMain.on('window:hide', () => win && win.hide())
ipcMain.on('window:show', showLauncher)
// o renderer avisa quando o jogo abre/fecha (para o menu da bandeja)
ipcMain.on('game:state', (_e, running) => {
  gameRunning = !!running
  refreshTrayMenu()
})

// ---- Persistência (JSON local em userData/settings.json) ----
ipcMain.handle('settings:load', async () => {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'))
  } catch {
    return null
  }
})
ipcMain.handle('settings:save', async (_e, data) => {
  const file = SETTINGS_FILE()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file) // escrita atômica
  return file
})
ipcMain.handle('settings:path', () => SETTINGS_FILE())

// ---- Utilidades (mock) ----
ipcMain.handle('shell:open-game-dir', async () => {
  const dir = path.join(app.getPath('userData'), '.minecraft')
  fs.mkdirSync(dir, { recursive: true })
  await shell.openPath(dir)
  return dir
})

// Links externos: só endereços do GitHub (página de releases do modpack)
ipcMain.handle('shell:open-external', async (_e, url) => {
  try {
    const u = new URL(String(url))
    if (u.protocol === 'https:' && (u.hostname === 'github.com' || u.hostname.endsWith('.github.com'))) await shell.openExternal(u.toString())
  } catch {
    /* URL inválida: ignora */
  }
})

app.whenReady().then(() => {
  createWindow()
  try {
    createTray()
  } catch (e) {
    console.warn('[tray] bandeja indisponível neste sistema:', e)
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
