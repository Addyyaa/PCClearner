import type { OperationResult, RiskLevel } from './common'

export type SignatureStatus = 'valid' | 'unsigned' | 'invalid' | 'notFound' | 'unknown'

export interface FileSignatureResult {
  id: string
  path: string
  name: string
  status: SignatureStatus
  signer?: string
  statusMessage: string
  riskLevel: RiskLevel
  recommendation: string
  /** 是否位于系统目录（系统目录内的异常更值得警惕）。 */
  isSystemPath: boolean
}

export interface SignatureVerifyRequest {
  paths: string[]
}

export interface SignatureVerifyResult {
  supported: boolean
  files: FileSignatureResult[]
  message?: string
}

export interface SignatureQuarantineRequest {
  paths: string[]
}

export type SignatureQuarantineResult = OperationResult
