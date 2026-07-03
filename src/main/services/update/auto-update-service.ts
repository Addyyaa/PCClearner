import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateInfo as ElectronUpdaterInfo } from 'electron-updater'
import type { UpdateCheckResult, UpdateStatusEvent } from '../../../../shared/types/update'
import { Logger } from '../../utils/logger'

// 中文注释: electron-updater 为 CommonJS 模块,ESM 项目须用默认导入再解构,不可用命名导入。
const { autoUpdater } = electronUpdater

/**
 * 基于 electron-updater + GitHub Releases 的自动更新服务。
 *
 * 关键说明:
 * - 仅在打包后的生产环境启用,开发模式跳过以避免无效请求。
 * - autoDownload 关闭,由用户确认后再下载,符合安全工具类产品的预期。
 * - 发布新版本时需在 GitHub Releases 上传安装包及 latest.yml。
 */
export class AutoUpdateService {
  private readonly logger = new Logger('AutoUpdateService')
  private initialized = false

  constructor() {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowDowngrade = false
  }

  /** 绑定主窗口并注册 updater 事件,仅需调用一次。 */
  initialize(): void {
    if (this.initialized || !app.isPackaged) return

    this.initialized = true
    this.logger.info('自动更新已启用,更新源: GitHub Releases')

    autoUpdater.on('checking-for-update', () => {
      this.broadcast({ type: 'checking', message: '正在检查更新...' })
    })

    autoUpdater.on('update-available', (info) => {
      this.broadcast({
        type: 'update-available',
        message: `发现新版本 ${info.version}`,
        version: info.version,
        updateInfo: this.toUpdateInfo(info)
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      this.broadcast({
        type: 'update-not-available',
        message: `当前已是最新版本 (${info.version})`,
        version: info.version
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.broadcast({
        type: 'download-progress',
        message: `正在下载更新 ${Math.round(progress.percent)}%`,
        progress: {
          percent: progress.percent,
          transferred: progress.transferred,
          total: progress.total
        }
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.broadcast({
        type: 'update-downloaded',
        message: `新版本 ${info.version} 已下载,可立即安装`,
        version: info.version,
        updateInfo: this.toUpdateInfo(info)
      })
    })

    autoUpdater.on('error', (error) => {
      this.logger.error('自动更新失败', error)
      this.broadcast({
        type: 'error',
        message: error.message || '检查更新失败,请稍后重试'
      })
    })
  }

  getCurrentVersion(): string {
    return app.getVersion()
  }

  isEnabled(): boolean {
    return app.isPackaged
  }

  /** 启动后延迟检查更新,避免阻塞首屏渲染。 */
  scheduleStartupCheck(delayMs = 5_000): void {
    if (!app.isPackaged) return

    setTimeout(() => {
      void this.checkForUpdates(false)
    }, delayMs)
  }

  async checkForUpdates(showNoUpdateMessage = true): Promise<UpdateCheckResult> {
    const currentVersion = this.getCurrentVersion()

    if (!app.isPackaged) {
      return {
        currentVersion,
        updateAvailable: false,
        message: '开发模式不支持检查更新,请使用打包后的安装版。'
      }
    }

    try {
      const result = await autoUpdater.checkForUpdates()
      const remoteVersion = result?.updateInfo?.version
      const updateAvailable = Boolean(remoteVersion && remoteVersion !== currentVersion)

      if (!updateAvailable && showNoUpdateMessage) {
        this.broadcast({
          type: 'update-not-available',
          message: `当前已是最新版本 (${currentVersion})`,
          version: currentVersion
        })
      }

      return {
        currentVersion,
        updateAvailable,
        updateInfo: result?.updateInfo ? this.toUpdateInfo(result.updateInfo) : undefined,
        message: updateAvailable ? `发现新版本 ${remoteVersion}` : `当前已是最新版本 (${currentVersion})`
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '检查更新失败'
      this.broadcast({ type: 'error', message })
      return { currentVersion, updateAvailable: false, message }
    }
  }

  async downloadUpdate(): Promise<{ success: boolean; message: string }> {
    if (!app.isPackaged) {
      return { success: false, message: '开发模式不支持下载更新' }
    }

    try {
      await autoUpdater.downloadUpdate()
      return { success: true, message: '开始下载更新' }
    } catch (error) {
      const message = error instanceof Error ? error.message : '下载更新失败'
      this.broadcast({ type: 'error', message })
      return { success: false, message }
    }
  }

  quitAndInstall(): void {
    if (!app.isPackaged) return
    autoUpdater.quitAndInstall(false, true)
  }

  private broadcast(event: UpdateStatusEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('update:status', event)
      }
    }
  }

  private toUpdateInfo(info: ElectronUpdaterInfo): {
    version: string
    releaseDate?: string
    releaseNotes?: string
  } {
    let releaseNotes: string | undefined
    if (typeof info.releaseNotes === 'string') {
      releaseNotes = info.releaseNotes
    } else if (Array.isArray(info.releaseNotes)) {
      releaseNotes = info.releaseNotes
        .map((note) => (typeof note === 'string' ? note : note.note ?? ''))
        .filter(Boolean)
        .join('\n')
    }

    return {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes
    }
  }
}
