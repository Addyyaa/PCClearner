import type { RiskLevel } from './common'

export interface DesktopAdSuspect {
  id: string
  processName: string
  pid?: number
  executablePath?: string
  windowTitle?: string
  serviceName?: string
  signals: string[]
  confidence: 'low' | 'medium' | 'high'
  riskLevel: RiskLevel
  suggestedAction: string
}

export interface DesktopAdScanResult {
  suspects: DesktopAdSuspect[]
  limitations: string[]
}

export interface DesktopAdResolveRequest {
  suspectIds: string[]
  terminateProcess: boolean
  disableStartup: boolean
  quarantine: boolean
}
