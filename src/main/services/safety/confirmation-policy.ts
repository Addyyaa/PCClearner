import type { DangerousOperationPreview, RiskLevel } from '../../../../shared/types'
import { createId } from '../../utils/id'

export class ConfirmationPolicy {
  createPreview(
    title: string,
    description: string,
    riskLevel: RiskLevel,
    affectedItems: number,
    estimatedImpact: string
  ): DangerousOperationPreview {
    return {
      operationId: createId('op'),
      title,
      description,
      riskLevel,
      affectedItems,
      estimatedImpact
    }
  }

  requiresSecondConfirmation(riskLevel: RiskLevel): boolean {
    return riskLevel === 'dangerous' || riskLevel === 'cautious'
  }
}
