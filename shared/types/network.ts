import type { OperationResult, RiskLevel } from './common'

export type NetworkLayer = 'link' | 'network' | 'dns' | 'transport' | 'application' | 'external'

export interface NetworkCheck {
  id: string
  layer: NetworkLayer
  name: string
  status: 'pass' | 'warning' | 'fail' | 'unknown'
  message: string
  evidence: string[]
  riskLevel: RiskLevel
}

export interface NetworkDiagnosis {
  checks: NetworkCheck[]
  rootCauses: string[]
  recommendedFixes: NetworkFixAction[]
}

export interface NetworkFixAction {
  id: string
  title: string
  description: string
  requiresElevation: boolean
  reversible: boolean
  platform: 'windows' | 'macos' | 'all'
}

export interface NetworkRepairResult extends OperationResult {
  actionId: string
}
