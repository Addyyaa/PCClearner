import type { CleanableItem, CleanableLocation, RiskLevel } from '../../../../shared/types'

export class CleanupRuleEngine {
  classify(location: CleanableLocation, filePath: string, sizeBytes: number): Pick<
    CleanableItem,
    'riskLevel' | 'selectedByDefault' | 'recommendedLabel' | 'description'
  > {
    const riskLevel = this.deriveRiskLevel(location, filePath, sizeBytes)

    return {
      riskLevel,
      selectedByDefault: riskLevel === 'recommended' || riskLevel === 'stronglyRecommended',
      recommendedLabel: this.getRecommendedLabel(riskLevel),
      description: this.describe(location, riskLevel)
    }
  }

  private deriveRiskLevel(location: CleanableLocation, filePath: string, sizeBytes: number): RiskLevel {
    if (location.category === 'update' || sizeBytes > 500 * 1024 * 1024) {
      return 'stronglyRecommended'
    }

    if (['temp', 'log', 'thumbnail', 'cache', 'browser'].includes(location.category)) {
      return 'recommended'
    }

    if (filePath.toLowerCase().includes('prefetch')) {
      return 'cautious'
    }

    return 'safe'
  }

  private getRecommendedLabel(riskLevel: RiskLevel): CleanableItem['recommendedLabel'] {
    if (riskLevel === 'stronglyRecommended') return '强烈建议删除'
    if (riskLevel === 'recommended') return '建议删除'
    if (riskLevel === 'cautious' || riskLevel === 'dangerous') return '谨慎处理'
    return '可保留'
  }

  private describe(location: CleanableLocation, riskLevel: RiskLevel): string {
    // 中文注释: 说明文案必须让用户理解删除影响,不能只显示技术名词。
    return `${location.description} 当前评估等级为 ${this.getRecommendedLabel(riskLevel)}。`
  }
}
