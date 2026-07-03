import type { NetworkCheck, NetworkDiagnosis, NetworkFixAction } from '../../../../shared/types'
import { NETWORK_FIX_DEFINITIONS, toFixAction } from './network-fix-catalog'

export class NetworkRuleEngine {
  inferDiagnosis(checks: NetworkCheck[]): Pick<NetworkDiagnosis, 'rootCauses' | 'recommendedFixes'> {
    const failedChecks = checks.filter((check) => check.status === 'fail' || check.status === 'warning')
    const rootCauses = failedChecks.map((check) => `${check.name}: ${check.message}`)

    return {
      rootCauses,
      recommendedFixes: this.selectFixes(failedChecks)
    }
  }

  /**
   * 根据故障检查项所在的网络层,匹配修复动作目录中 targetLayers 命中的修复。
   * 关键点: 同一修复可能对应多个层,这里用 Set 去重,保证按目录顺序稳定输出。
   */
  private selectFixes(failedChecks: NetworkCheck[]): NetworkFixAction[] {
    const failedLayers = new Set(failedChecks.map((check) => check.layer))

    return NETWORK_FIX_DEFINITIONS.filter((definition) =>
      definition.targetLayers.some((layer) => failedLayers.has(layer))
    ).map(toFixAction)
  }
}
