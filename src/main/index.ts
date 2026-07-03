import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers, initializeAutoUpdate } from './ipc'
import { createServiceContainer } from './services/service-container'

const services = createServiceContainer()

/** 解析 preload 脚本路径（electron-vite ESM 项目输出为 index.mjs） */
function resolvePreloadPath(): string {
  const candidates = [join(__dirname, '../preload/index.mjs'), join(__dirname, '../preload/index.js')]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: 'PCCleaner',
    backgroundColor: '#101827',
    webPreferences: {
      preload: resolvePreloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    return
  }

  void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  registerIpcHandlers(services)
  initializeAutoUpdate()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
