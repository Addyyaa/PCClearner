import type { RiskLevel } from './common'

export interface CleanableLocation {
  id: string
  name: string
  path: string
  platform: 'windows' | 'macos'
  category: 'temp' | 'cache' | 'log' | 'browser' | 'recycleBin' | 'update' | 'thumbnail' | 'other'
  requiresElevation: boolean
  description: string
  /**
   * direct: 直接枚举该目录下的文件（默认）。
   * junkHeuristic: 深度递归子目录，仅命中垃圾目录/垃圾文件模式，用于第三方应用垃圾。
   */
  scanMode?: 'direct' | 'junkHeuristic'
}

export interface CleanableItem {
  id: string
  path: string
  name: string
  sizeBytes: number
  category: CleanableLocation['category']
  riskLevel: RiskLevel
  selectedByDefault: boolean
  recommendedLabel: '可保留' | '建议删除' | '强烈建议删除' | '谨慎处理'
  description: string
  lastModified?: string
  sourceLocationId: string
  /** 该清理项是否为整个目录（如应用的 Cache 文件夹）。 */
  isDirectory?: boolean
  /** 来源应用名称（第三方应用垃圾扫描时展示）。 */
  appName?: string
}

export interface DiskScanOptions {
  targetPath?: string
  includeSystemDisk: boolean
  includeBrowserCaches: boolean
  maxDepth?: number
}

export interface DiskScanSummary {
  totalItems: number
  selectedItems: number
  totalBytes: number
  selectedBytes: number
  /** 因权限不足未能扫描的位置，可在 UI 中提示提权扫描 */
  inaccessibleLocations?: string[]
}

export interface DiskScanResult {
  items: CleanableItem[]
  summary: DiskScanSummary
}

export interface CleanRequest {
  itemIds: string[]
  moveToTrash: boolean
  createBackup: boolean
}
