import { contextBridge, ipcRenderer } from 'electron'
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
} from '../../shared/types'
import type { UpdateStatusEvent } from '../../shared/types/update'

const api = {
  app: {
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    showItemInFolder: (targetPath: string) => ipcRenderer.invoke('app:show-item-in-folder', targetPath),
    pickFiles: () => ipcRenderer.invoke('app:pick-files')
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    rollback: (rollbackId: string) => ipcRenderer.invoke('history:rollback', rollbackId)
  },
  disk: {
    scan: (options: DiskScanOptions) => ipcRenderer.invoke('disk:scan', options),
    clean: (request: CleanRequest) => ipcRenderer.invoke('disk:clean', request),
    listVolumes: () => ipcRenderer.invoke('disk:list-volumes')
  },
  description: {
    get: (query: DescriptionQuery) => ipcRenderer.invoke('description:get', query),
    openOnlineSearch: (query: DescriptionQuery) => ipcRenderer.invoke('description:open-online-search', query)
  },
  duplicates: {
    scan: (options: DuplicateScanOptions) => ipcRenderer.invoke('duplicates:scan', options)
  },
  diskUsage: {
    report: (rootPath: string) => ipcRenderer.invoke('disk-usage:report', rootPath),
    estimate: (sizes: number[]) => ipcRenderer.invoke('disk-usage:estimate', sizes)
  },
  registry: {
    scan: () => ipcRenderer.invoke('registry:scan'),
    clean: (request: RegistryCleanRequest) => ipcRenderer.invoke('registry:clean', request)
  },
  startup: {
    list: () => ipcRenderer.invoke('startup:list'),
    setEnabled: (request: StartupChangeRequest) => ipcRenderer.invoke('startup:set-enabled', request)
  },
  network: {
    diagnose: () => ipcRenderer.invoke('network:diagnose'),
    listFixes: () => ipcRenderer.invoke('network:list-fixes'),
    repair: (action: NetworkFixAction) => ipcRenderer.invoke('network:repair', action)
  },
  ads: {
    scan: () => ipcRenderer.invoke('ads:scan'),
    resolve: (request: DesktopAdResolveRequest) => ipcRenderer.invoke('ads:resolve', request)
  },
  signature: {
    verify: (request: SignatureVerifyRequest) => ipcRenderer.invoke('signature:verify', request),
    quarantine: (request: SignatureQuarantineRequest) => ipcRenderer.invoke('signature:quarantine', request)
  },
  residual: {
    scan: () => ipcRenderer.invoke('residual:scan'),
    quarantine: (request: ResidualQuarantineRequest) => ipcRenderer.invoke('residual:quarantine', request)
  },
  migration: {
    list: () => ipcRenderer.invoke('migration:list'),
    migrate: (request: SoftwareMigrationRequest) => ipcRenderer.invoke('migration:migrate', request)
  },
  update: {
    getVersion: () => ipcRenderer.invoke('update:get-version') as Promise<string>,
    isEnabled: () => ipcRenderer.invoke('update:is-enabled') as Promise<boolean>,
    check: (showNoUpdateMessage = true) => ipcRenderer.invoke('update:check', showNoUpdateMessage),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (callback: (event: UpdateStatusEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: UpdateStatusEvent) => callback(event)
      ipcRenderer.on('update:status', handler)
      return () => {
        ipcRenderer.removeListener('update:status', handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type PccleanerApi = typeof api
