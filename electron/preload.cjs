// Ponte segura entre o renderer e o processo principal.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('akashic', {
  isElectron: true,
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    hide: () => ipcRenderer.send('window:hide'),
    show: () => ipcRenderer.send('window:show'),
    onMaximized: (cb) => {
      const fn = (_e, v) => cb(v)
      ipcRenderer.on('window:maximized', fn)
      return () => ipcRenderer.removeListener('window:maximized', fn)
    },
  },
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (data) => ipcRenderer.invoke('settings:save', data),
    path: () => ipcRenderer.invoke('settings:path'),
  },
  shell: {
    openGameDir: () => ipcRenderer.invoke('shell:open-game-dir'),
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  },
})
