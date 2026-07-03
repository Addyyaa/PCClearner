import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type {
  CleanRequest,
  DescriptionQuery,
  DesktopAdResolveRequest,
  DiskScanOptions,
  DuplicateScanOptions,
  NetworkFixAction,
  RegistryCleanRequest,
  ResidualQuarantineRequest,
  SignatureQuarantineRequest,
  SignatureVerifyRequest,
  SoftwareMigrationRequest,
  StartupChangeRequest
} from '../../../shared/types'
import type { ServiceContainer } from '../services/service-container'
import { AutoUpdateService } from '../services/update/auto-update-service'

const autoUpdateService = new AutoUpdateService()

export function registerIpcHandlers(services: ServiceContainer): void {
  ipcMain.handle('app:get-platform', () => services.platform.getPlatform())
  ipcMain.handle('app:show-item-in-folder', (_, targetPath: string) => shell.showItemInFolder(targetPath))
  ipcMain.handle('app:pick-files', async () => {
    const focused = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const dialogResult = focused
      ? await dialog.showOpenDialog(focused, { properties: ['openFile', 'multiSelections'] })
      : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })

    return dialogResult.canceled ? [] : dialogResult.filePaths
  })
  ipcMain.handle('history:list', () => services.operationHistory.list())
  ipcMain.handle('history:rollback', (_, rollbackId: string) => services.operationHistory.rollback(rollbackId))

  ipcMain.handle('disk:scan', (_, options: DiskScanOptions) => services.diskCleaner.scan(options))
  ipcMain.handle('disk:clean', (_, request: CleanRequest) => services.diskCleaner.clean(request))
  ipcMain.handle('disk:list-volumes', () => services.diskUsage.getVolumes())

  ipcMain.handle('description:get', (_, query: DescriptionQuery) => services.description.describe(query))
  ipcMain.handle('description:open-online-search', (_, query: DescriptionQuery) => services.description.openOnlineSearch(query))

  ipcMain.handle('duplicates:scan', (_, options: DuplicateScanOptions) => services.duplicates.scan(options))
  ipcMain.handle('disk-usage:report', (_, rootPath: string) => services.diskUsage.getUsageReport(rootPath))
  ipcMain.handle('disk-usage:estimate', (_, sizes: number[]) => services.diskUsage.estimateReclaimableBytes(sizes))

  ipcMain.handle('registry:scan', () => services.registry.scan())
  ipcMain.handle('registry:clean', (_, request: RegistryCleanRequest) => services.registry.clean(request))

  ipcMain.handle('startup:list', () => services.startup.listStartupItems())
  ipcMain.handle('startup:set-enabled', (_, request: StartupChangeRequest) => services.startup.setEnabled(request))

  ipcMain.handle('network:diagnose', () => services.networkDiagnostics.diagnose())
  ipcMain.handle('network:list-fixes', () => services.networkRepair.listAvailableFixes())
  ipcMain.handle('network:repair', (_, action: NetworkFixAction) => services.networkRepair.repair(action))

  ipcMain.handle('ads:scan', () => services.ads.scan())
  ipcMain.handle('ads:resolve', (_, request: DesktopAdResolveRequest) => services.ads.resolve(request))

  ipcMain.handle('signature:verify', (_, request: SignatureVerifyRequest) => services.signature.verify(request))
  ipcMain.handle('signature:quarantine', (_, request: SignatureQuarantineRequest) => services.signature.quarantine(request))

  ipcMain.handle('residual:scan', () => services.residual.scan())
  ipcMain.handle('residual:quarantine', (_, request: ResidualQuarantineRequest) => services.residual.quarantine(request))

  ipcMain.handle('migration:list', () => services.migration.listPrograms())
  ipcMain.handle('migration:migrate', (_, request: SoftwareMigrationRequest) => services.migration.migrate(request))

  ipcMain.handle('update:get-version', () => autoUpdateService.getCurrentVersion())
  ipcMain.handle('update:is-enabled', () => autoUpdateService.isEnabled())
  ipcMain.handle('update:check', (_, showNoUpdateMessage?: boolean) =>
    autoUpdateService.checkForUpdates(showNoUpdateMessage ?? true)
  )
  ipcMain.handle('update:download', () => autoUpdateService.downloadUpdate())
  ipcMain.handle('update:install', () => autoUpdateService.quitAndInstall())
}

export function initializeAutoUpdate(): AutoUpdateService {
  autoUpdateService.initialize()
  autoUpdateService.scheduleStartupCheck()
  return autoUpdateService
}
