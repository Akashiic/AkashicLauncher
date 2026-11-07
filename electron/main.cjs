// Akashic Launcher — processo principal do Electron.
// Janela frameless, controles de janela via IPC e persistência das configurações em JSON local.
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json')

/** @type {BrowserWindow | null} */
let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 780,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    transparent: false,
    backgroundColor: '#090A0F',
    show: false,
    titleBarStyle: 'hidden',
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
ipcMain.on('window:show', () => win && (win.show(), win.focus()))

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

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
