export type PlatformName = 'windows' | 'macos' | 'linux' | 'unknown'

export type RiskLevel = 'safe' | 'recommended' | 'stronglyRecommended' | 'cautious' | 'dangerous'

export type OperationStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AppError {
  code: string
  message: string
  details?: string
}

export interface OperationResult {
  success: boolean
  message: string
  rollbackId?: string
  error?: AppError
}

export interface ProgressEvent {
  operationId: string
  status: OperationStatus
  percent: number
  message: string
}

export interface DangerousOperationPreview {
  operationId: string
  title: string
  description: string
  riskLevel: RiskLevel
  affectedItems: number
  estimatedImpact: string
}
