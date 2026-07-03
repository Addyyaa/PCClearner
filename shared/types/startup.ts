import type { RiskLevel } from './common'

export interface StartupItem {
  id: string
  name: string
  command: string
  source: 'registryRun' | 'startupFolder' | 'scheduledTask' | 'service' | 'launchAgent' | 'launchDaemon' | 'loginItem'
  enabled: boolean
  publisher?: string
  path?: string
  riskLevel: RiskLevel
  description: string
}

export interface StartupChangeRequest {
  itemIds: string[]
  enabled: boolean
  createRollback: boolean
}
