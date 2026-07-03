import type { OperationResult, RiskLevel } from './common'

/** 注册表中读取到的已安装程序信息。 */
export interface InstalledProgram {
  id: string
  name: string
  publisher?: string
  installLocation?: string
  estimatedSizeBytes?: number
  /** 安装目录是否位于系统盘（可迁移的前提之一）。 */
  isOnSystemDrive: boolean
  /** 是否满足迁移条件（有有效安装目录、位于系统盘、非受保护路径）。 */
  canMigrate: boolean
  /** 不可迁移时的原因说明。 */
  migrateBlockReason?: string
}

export interface InstalledProgramListResult {
  supported: boolean
  programs: InstalledProgram[]
  message?: string
}

/** 疑似卸载残留目录。 */
export interface ResidualItem {
  id: string
  name: string
  path: string
  sizeBytes: number
  source: 'roamingAppData' | 'localAppData' | 'programData' | 'programFiles' | 'programFilesX86'
  riskLevel: RiskLevel
  reason: string
  recommendation: string
}

export interface ResidualScanResult {
  supported: boolean
  items: ResidualItem[]
  message?: string
}

export interface ResidualQuarantineRequest {
  paths: string[]
}

export type ResidualQuarantineResult = OperationResult

/** 软件迁移请求：把系统盘上的软件目录搬到其他磁盘并建立目录联接。 */
export interface SoftwareMigrationRequest {
  name: string
  sourcePath: string
  targetDrive: string
}

export interface SoftwareMigrationResult extends OperationResult {
  targetPath?: string
}
