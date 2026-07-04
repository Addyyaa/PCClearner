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
  /** 与本检查项直接关联的参数化修复动作(如终止特定进程)。 */
  relatedFixes?: NetworkFixAction[]
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
  /** 修复目标,如诊断动态识别出的嫌疑进程名 */
  target?: string
}

export interface NetworkRepairResult extends OperationResult {
  actionId: string
}
