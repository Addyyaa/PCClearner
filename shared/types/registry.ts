import type { RiskLevel } from './common'

export interface RegistryIssue {
  id: string
  hive: 'HKCU' | 'HKLM' | 'HKCR' | 'HKU' | 'HKCC'
  keyPath: string
  valueName?: string
  issueType: 'uninstallResidue' | 'fileAssociation' | 'orphanCom' | 'startup' | 'sharedDll' | 'mru'
  riskLevel: RiskLevel
  selectedByDefault: boolean
  description: string
}

export interface RegistryScanResult {
  supported: boolean
  issues: RegistryIssue[]
  message?: string
}

export interface RegistryCleanRequest {
  issueIds: string[]
  exportBackup: boolean
}
